import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the SQL migrations directory regardless of layout:
 *  - src/db      → ../../migrations  (backend/migrations, tsx/dev + tests)
 *  - dist/src/db → ../../../migrations (backend/migrations, compiled production)
 */
function resolveMigrationsDir(): string {
  const candidates = [
    path.resolve(__dirname, '../../migrations'),
    path.resolve(__dirname, '../../../migrations'),
    path.resolve(process.cwd(), 'migrations'),
  ];
  return candidates.find((c) => fs.existsSync(path.join(c, '001_extensions_core.sql'))) ?? candidates[0];
}
export const migrationsDir = resolveMigrationsDir();

async function ensureTable() {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;
}

export function listMigrations(): string[] {
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

export async function appliedMigrations(): Promise<string[]> {
  await ensureTable();
  const rows = await sql`SELECT name FROM schema_migrations ORDER BY name`;
  return rows.map((r) => r.name);
}

export async function migrateUp(): Promise<string[]> {
  await ensureTable();
  const applied = new Set(await appliedMigrations());
  const pending = listMigrations().filter((m) => !applied.has(m));
  for (const name of pending) {
    const file = path.join(migrationsDir, name);
    const statements = fs.readFileSync(file, 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(statements);
      await tx`INSERT INTO schema_migrations (name) VALUES (${name})`;
    });
    console.log(`[migrate] applied ${name}`);
  }
  if (pending.length === 0) console.log('[migrate] database is up to date');
  return pending;
}

export async function migrateStatus() {
  await ensureTable();
  const applied = new Set(await appliedMigrations());
  return listMigrations().map((name) => ({ name, applied: applied.has(name) }));
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  const cmd = process.argv[2] ?? 'up';
  if (cmd === 'up') {
    migrateUp().then(() => sql.end()).catch((e) => { console.error(e); process.exit(1); });
  } else if (cmd === 'status') {
    migrateStatus()
      .then((rows) => {
        for (const r of rows) console.log(`${r.applied ? '✔' : '·'} ${r.name}`);
      })
      .then(() => sql.end());
  } else {
    console.error('Unknown command. Use: up | status');
    process.exit(1);
  }
}
