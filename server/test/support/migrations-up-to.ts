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
