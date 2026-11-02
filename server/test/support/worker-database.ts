import { sql } from 'drizzle-orm';
import { createDatabase } from '../../src/database/database';

/** The address of one Vitest worker's own database: the same server, the base name plus the pool.
 *
 *  Example: `workerDatabaseUrl('postgres://u:p@localhost:5432/lorkarium', '2')` ends in `/lorkarium_worker_2` */
export function workerDatabaseUrl(baseUrl: string, poolId: string): string {
  if (!/^\d+$/.test(poolId)) {
    throw new Error(`expected a numeric Vitest pool id, got "${poolId}"`);
  }
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname}_worker_${poolId}`;
  return url.toString();
}

/** Creates the worker's database on its first spec file; the name comes from `workerDatabaseUrl`,
 *  so it is safe to inline in the statement.
 *
 *  Example: `await ensureWorkerDatabase(baseUrl, workerDatabaseUrl(baseUrl, '2'))` */
export async function ensureWorkerDatabase(baseUrl: string, workerUrl: string): Promise<void> {
  const name = new URL(workerUrl).pathname.slice(1);
  const admin = createDatabase(baseUrl);
  try {
    const found = await admin.db.execute(sql`SELECT 1 FROM pg_database WHERE datname = ${name}`);
    if (found.rows.length === 0) await admin.db.execute(sql.raw(`CREATE DATABASE "${name}"`));
  } finally {
    await admin.close();
  }
}
