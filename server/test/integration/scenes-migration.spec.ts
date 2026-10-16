import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readEnv } from '../../src/config/env';
import { createDatabase, type DatabaseConnection } from '../../src/database/database';
import { MIGRATIONS_FOLDER } from '../../src/database/migrate';

const SCRATCH_DATABASE = 'lorkarium_scenes_migration';
const LAST_MIGRATION_BEFORE_SCENES = '0001_campaigns';

type JournalEntry = { tag: string };

// Migrations up to (and including) `lastTag`, so a database can be left exactly as it was then.
async function migrationsUpTo(lastTag: string): Promise<string> {
  const folder = await mkdtemp(path.join(tmpdir(), 'lorkarium-migrations-'));
  await cp(MIGRATIONS_FOLDER, folder, { recursive: true });
  const journalPath = path.join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as { entries: JournalEntry[] };
  const cut = journal.entries.findIndex((entry) => entry.tag === lastTag);
  const entries = journal.entries.slice(0, cut + 1);
  await writeFile(journalPath, JSON.stringify({ ...journal, entries }));
  return folder;
}

function urlOf(database: string): string {
  const url = new URL(readEnv(process.env).databaseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

describe('migrations 0002_scenes and 0004_conditions on a database with campaigns', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;
  let partialFolder: string;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH_DATABASE}`));
    scratch = createDatabase(urlOf(SCRATCH_DATABASE));
    partialFolder = await migrationsUpTo(LAST_MIGRATION_BEFORE_SCENES);
    await migrate(scratch.db, { migrationsFolder: partialFolder });
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.close();
    await rm(partialFolder, { recursive: true, force: true });
  });

  it('a campaign created before the migrations gets its active 20×12 scene and the 11 initial conditions', async () => {
    await scratch.db.execute(sql`
      INSERT INTO users (id, name, email, password_hash)
      VALUES ('6a1d2c3b-4e5f-4a7b-8c9d-0e1f2a3b4c5d', 'Ana', 'ana@x.com', 'hash')`);
    await scratch.db.execute(sql`
      INSERT INTO campaigns (id, owner_id, name, join_code)
      VALUES ('3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10', '6a1d2c3b-4e5f-4a7b-8c9d-0e1f2a3b4c5d',
              'Vharn', 'VHRN7K2Q')`);
    await migrate(scratch.db, { migrationsFolder: MIGRATIONS_FOLDER });
    const { rows } = await scratch.db.execute<{ width_cells: number; height_cells: number }>(sql`
      SELECT s.width_cells, s.height_cells FROM campaigns c
      JOIN scenes s ON s.id = c.active_scene_id AND s.campaign_id = c.id`);
    expect(rows).toEqual([{ width_cells: 20, height_cells: 12 }]);
    const conditions = await scratch.db.execute<{ total: number }>(sql`
      SELECT count(*)::int AS total FROM condition_definitions
      WHERE campaign_id = '3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10'`);
    expect(conditions.rows).toEqual([{ total: 11 }]);
  });
});
