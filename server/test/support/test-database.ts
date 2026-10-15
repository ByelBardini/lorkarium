import { sql } from 'drizzle-orm';
import { readEnv } from '../../src/config/env';
import {
  createDatabase,
  type Database,
  type DatabaseConnection,
} from '../../src/database/database';
import { runMigrations } from '../../src/database/migrate';

/** Connects to the disposable Postgres in DATABASE_URL (never the `pnpm db:up` one) and migrates it.
 *
 *  Example: `const connection = await openTestDatabase(); afterAll(connection.close)` */
export async function openTestDatabase(): Promise<DatabaseConnection> {
  const connection = createDatabase(readEnv(process.env).databaseUrl);
  await runMigrations(connection.db);
  return connection;
}

/** Empties every table so each spec starts from a blank database.
 *
 *  Example: `beforeEach(() => truncateAllTables(db))` */
export async function truncateAllTables(db: Database): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE users, auth_sessions, campaigns, campaign_members RESTART IDENTITY CASCADE`,
  );
}
