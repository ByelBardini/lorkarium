import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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

/** Applies the pending migrations up to `lastTag` (inclusive) and stops there: the whole migrate
 *  is one transaction, so a later migration that refuses would roll back the earlier ones too.
 *
 *  Example: `await runMigrationsThrough(db, '0038_email_cipher')` */
export async function runMigrationsThrough(db: Database, lastTag: string): Promise<void> {
  const folder = await migrationsFolderThrough(lastTag);
  try {
    await migrate(db, { migrationsFolder: folder });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

type JournalEntry = { tag: string };

/** A copy of the migrations folder that stops at `lastTag` (inclusive); the caller removes it.
 *
 *  Example: `await migrate(db, { migrationsFolder: await migrationsFolderThrough('0018_token_sight') })` */
export async function migrationsFolderThrough(lastTag: string): Promise<string> {
  const folder = await mkdtemp(path.join(tmpdir(), 'lorkarium-migrations-'));
  await cp(MIGRATIONS_FOLDER, folder, { recursive: true });
  const journalPath = path.join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as { entries: JournalEntry[] };
  const cut = journal.entries.findIndex((entry) => entry.tag === lastTag);
  if (cut < 0) {
    await rm(folder, { recursive: true, force: true });
    throw new Error(`migration ${lastTag} is not in the journal; expected a known tag`);
  }
  await writeFile(
    journalPath,
    JSON.stringify({ ...journal, entries: journal.entries.slice(0, cut + 1) }),
  );
  return folder;
}
