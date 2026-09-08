/**
 * Test bootstrap: creates the test database (if needed) and applies migrations.
 * Uses the embedded dev PostgreSQL server (must be running: npm run dev:db).
 */
import postgres from 'postgres';
import { migrateUp } from '../src/db/migrate.js';

let _sql: any = null;

export async function setupTestDb() {
  const admin = postgres('postgresql://postgres:postgres@localhost:15432/postgres?client_encoding=UTF8', { max: 1 });
  const exists = await admin`SELECT 1 FROM pg_database WHERE datname = 'gadaviral_test'`;
  if (exists.length === 0) {
    await admin.unsafe(`CREATE DATABASE gadaviral_test ENCODING 'UTF8' TEMPLATE template0`);
  }
  await admin.end();
  const { sql } = await import('../src/db/client.js');
  _sql = sql;
  await migrateUp();
  return sql;
}

export async function getSql() {
  if (!_sql) await setupTestDb();
  return _sql!;
}

export async function closeSql() {
  if (_sql) {
    await _sql.end();
    _sql = null;
  }
}

/** Extract the 6-digit OTP from the most recent outbox email for an address. */
export async function latestOtpFromOutbox(email: string): Promise<string | null> {
  const s = await getSql();
  const rows = await s`
    SELECT html FROM outbox_emails WHERE to_email = ${email}
    ORDER BY created_at DESC LIMIT 1`;
  const html: string = rows[0]?.html ?? '';
  const m = html.match(/font-size:32px;[^>]*>(\d{6})</) ?? html.match(/>(\d{6})</);
  return m ? m[1] : null;
}

/** Extract a one-time link token from the most recent outbox email. */
export async function latestLinkFromOutbox(email: string, kind: 'verify' | 'reset' | 'confirm'): Promise<string | null> {
  const s = await getSql();
  const rows = await s`
    SELECT html FROM outbox_emails WHERE to_email = ${email}
    ORDER BY created_at DESC LIMIT 1`;
  const html: string = rows[0]?.html ?? '';
  const patterns: Record<string, RegExp> = {
    verify: /verify-email\?token=([A-Za-z0-9_\-]+)/,
    reset: /reset-password\?token=([A-Za-z0-9_\-]+)/,
    confirm: /confirm-email\?token=([A-Za-z0-9_\-]+)/,
  };
  const m = html.match(patterns[kind]);
  return m ? m[1] : null;
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@test.gadaviral.dev`;
}

