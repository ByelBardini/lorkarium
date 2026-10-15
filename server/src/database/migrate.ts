import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Database } from './database';

export const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../../drizzle');

/** Applies the SQL in `server/drizzle/` that the database has not run yet.
 *
 *  Example: `await runMigrations(db)` */
export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
