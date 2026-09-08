// Boots a persistent embedded PostgreSQL for local development/testing.
// Usage: node scripts/dev-db.mjs  (initialises .data/pg on first run)
// Real PostgreSQL binaries are provided by the `embedded-postgres` package.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
// Space-free path (Windows initdb is unreliable under "C:\Users\I AM\...")
const dataDir = process.env.DEV_PG_DATA || 'C:\\ProgramData\\GADAVIRAL\\pg';
const marker = path.join(dataDir, '.initialised');
const PORT = Number(process.env.DEV_PG_PORT || 15432);
const USER = 'postgres';
const PASSWORD = 'postgres';
const DB = process.env.DEV_PG_DB || 'gadaviral';

let EmbeddedPostgres = null;
try {
  const mod = await import('embedded-postgres');
  EmbeddedPostgres = mod.default ?? mod;
} catch (err) {
  console.error('[dev-db] embedded-postgres not installed. Set DATABASE_URL to an external PostgreSQL instead.');
  console.error(err?.message ?? err);
  process.exit(1);
}

fs.mkdirSync(dataDir, { recursive: true });
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});


let initialised = fs.existsSync(marker);
if (!initialised) {
  console.log('[dev-db] initialising PostgreSQL data directory (UTF-8)…');
  await pg.initialise();
  fs.writeFileSync(marker, String(Date.now()));
  initialised = true;
}
console.log('[dev-db] starting PostgreSQL on port', PORT, '…');
await pg.start();
try {
  await pg.createDatabase(DB);
  console.log('[dev-db] database created:', DB);
} catch (e) {
  // already exists — fine
}
fs.writeFileSync(
  path.join(root, '.data', 'pg-info.json'),
  JSON.stringify({ port: PORT, user: USER, password: PASSWORD, database: DB }, null, 2),
);
console.log(`[dev-db] ready → postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DB}`);
console.log('[dev-db] keep this process running while developing (Ctrl+C stops it).');
setInterval(() => {}, 1 << 30); // keep alive so the embedded server stays up
