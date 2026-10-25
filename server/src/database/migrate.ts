import { access, cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Database } from './database';

/** The `server/drizzle/` beside a folder directly under `server/`: `src/` under tsx, `dist/` in
 *  the bundle (where `import.meta.dirname` is `server/dist`, one level shallower than this file).
 *
 *  Example: `migrationsFolderOf(import.meta.dirname) // '/app/server/drizzle'` */
export function migrationsFolderOf(serverSubfolder: string): string {
  return path.resolve(serverSubfolder, '..', 'drizzle');
}

export const MIGRATIONS_FOLDER = migrationsFolderOf(path.resolve(import.meta.dirname, '..'));

/** Applies the SQL in `folder` (`server/drizzle/` by default) that the database has not run yet.
 *
 *  Example: `await runMigrations(db, migrationsFolderOf(import.meta.dirname))` */
export async function runMigrations(db: Database, folder = MIGRATIONS_FOLDER): Promise<void> {
  const journalPath = path.join(folder, 'meta', '_journal.json');
  await access(journalPath).catch(() => {
    throw new Error(`no migrations at ${folder}: expected ${journalPath} (the drizzle-kit output)`);
  });
  await migrate(db, { migrationsFolder: folder });
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
