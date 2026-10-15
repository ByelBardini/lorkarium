import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

export type DatabaseConnection = Readonly<{ db: Database; close: () => Promise<void> }>;

/** The Drizzle client over a `pg` pool; whoever creates it closes it.
 *
 *  Example: `const { db, close } = createDatabase(env.databaseUrl)` */
export function createDatabase(url: string): DatabaseConnection {
  const pool = new Pool({ connectionString: url });
  return { db: drizzle({ client: pool, schema }), close: () => pool.end() };
}
