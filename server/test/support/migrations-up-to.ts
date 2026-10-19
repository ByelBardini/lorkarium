import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readEnv } from '../../src/config/env';
import { MIGRATIONS_FOLDER } from '../../src/database/migrate';

type JournalEntry = { tag: string };

/** A copy of the migrations folder that stops at `lastTag` (inclusive), so a scratch database can
 *  be left exactly as it was then. The caller removes the folder.
 *
 *  Example: `await migrate(scratch.db, { migrationsFolder: await migrationsUpTo('0018_token_sight') })` */
export async function migrationsUpTo(lastTag: string): Promise<string> {
  const folder = await mkdtemp(path.join(tmpdir(), 'lorkarium-migrations-'));
  await cp(MIGRATIONS_FOLDER, folder, { recursive: true });
  const journalPath = path.join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as { entries: JournalEntry[] };
  const cut = journal.entries.findIndex((entry) => entry.tag === lastTag);
  if (cut < 0) throw new Error(`migration ${lastTag} is not in the journal; expected a known tag`);
  const entries = journal.entries.slice(0, cut + 1);
  await writeFile(journalPath, JSON.stringify({ ...journal, entries }));
  return folder;
}

/** The `DATABASE_URL` of the tests pointed at another database of the same server.
 *
 *  Example: `createDatabase(databaseUrlNamed('lorkarium_scenes_migration'))` */
export function databaseUrlNamed(database: string): string {
  const url = new URL(readEnv(process.env).databaseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}
