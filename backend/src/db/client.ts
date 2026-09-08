import postgres from 'postgres';
import { config } from '../config.js';

export const sql = postgres(config.databaseUrl, {
  max: config.dbPoolMax,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
  prepare: !config.databaseSsl,
  onnotice: () => {},
});

export type Row = Record<string, any>;

/** Run a function inside a transaction. */
export async function withTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  return (sql as any).begin(fn) as Promise<T>;
}

/** Join SQL fragments (default separator: AND) without relying on sql.join. */
export function andJoin(parts: any[], sep?: any) {
  let acc: any = null;
  for (const p of parts) {
    acc = acc === null ? p : sql`${acc}${sep ?? sql` AND `}${p}`;
  }
  return acc ?? sql`true`;
}

