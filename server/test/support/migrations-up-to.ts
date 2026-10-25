import { sql } from 'drizzle-orm';
import type { Database } from '../../src/database/database';
import { newUserPo } from './auth-factories';
import { readEnv } from '../../src/config/env';
import { migrationsFolderThrough } from '../../src/database/migrate';

// The last migration that still keeps the e-mail in clear: a spec that seeds raw users at an old
// migration stops here, because 0039 refuses accounts that were never sealed.
export const LAST_MIGRATION_WITH_PLAIN_EMAIL = '0038_email_cipher';

/** A copy of the migrations folder that stops at `lastTag` (inclusive), so a scratch database can
 *  be left exactly as it was then. The caller removes the folder.
 *
 *  Example: `await migrate(scratch.db, { migrationsFolder: await migrationsUpTo('0018_token_sight') })` */
export async function migrationsUpTo(lastTag: string): Promise<string> {
  return migrationsFolderThrough(lastTag);
}

/** The `DATABASE_URL` of the tests pointed at another database of the same server.
 *
 *  Example: `createDatabase(databaseUrlNamed('lorkarium_scenes_migration'))` */
export function databaseUrlNamed(database: string): string {
  const url = new URL(readEnv(process.env).databaseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

/** Inserts an account at an old migration with raw SQL: the current `UsersDao` writes every column
 *  of today's `users` (0054 added `terms_accepted_at`), which a database stopped earlier lacks.
 *  Only the columns that exist since the e-mail was sealed (0039) are written.
 *
 *  Example: `const ownerId = await insertUserAtOldMigration(scratch.db, { email: 'ana@mesa.com' })` */
export async function insertUserAtOldMigration(
  db: Database,
  overrides: Readonly<{ name?: string; email?: string }> = {},
): Promise<string> {
  const user = newUserPo(overrides);
  const { rows } = await db.execute<{ id: string }>(sql`
    INSERT INTO users (name, username, email_cipher, email_index, password_hash)
    VALUES (${user.name}, ${user.username}, ${user.emailCipher}, ${user.emailIndex}, ${user.passwordHash})
    RETURNING id`);
  const [row] = rows;
  if (!row)
    throw new Error(`insert into users at an old migration returned no row for ${user.username}`);
  return row.id;
}
