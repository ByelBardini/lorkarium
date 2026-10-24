import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

export type DatabaseConnection = Readonly<{ db: Database; close: () => Promise<void> }>;

/** Hears every SQL statement the client sends (the shape of Drizzle's `logger`): the integration
 *  specs count queries per command with it. */
export interface QueryLog {
  logQuery(query: string, params: unknown[]): void;
}

/** Pool size and per-connection timeouts (`env.database`); one left out keeps the `pg` default
 *  (10 connections, no timeout). */
export type DatabaseOptions = Readonly<{
  queryLog?: QueryLog;
  poolMax?: number;
  statementTimeoutMs?: number;
  lockTimeoutMs?: number;
}>;

/** The Drizzle client over a `pg` pool; whoever creates it closes it.
 *
 *  Example: `const { db, close } = createDatabase(env.databaseUrl, { ...env.database })` */
export function createDatabase(url: string, options: DatabaseOptions = {}): DatabaseConnection {
  const pool = new Pool({ connectionString: url, ...poolSettingsOf(options) });
  const logger = options.queryLog ?? false;
  return { db: drizzle({ client: pool, schema, logger }), close: () => pool.end() };
}

// `pg` sends statement_timeout and lock_timeout as startup settings of every new connection.
function poolSettingsOf(options: DatabaseOptions): PoolConfig {
  const settings: PoolConfig = {};
  if (options.poolMax !== undefined) settings.max = options.poolMax;
  if (options.statementTimeoutMs !== undefined) {
    settings.statement_timeout = options.statementTimeoutMs;
  }
  if (options.lockTimeoutMs !== undefined) settings.lock_timeout = options.lockTimeoutMs;
  return settings;
}
