import { rm } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readEnv } from '../../src/config/env';
import { createDatabase, type DatabaseConnection } from '../../src/database/database';
import {
  databaseUrlNamed,
  insertUserAtOldMigration,
  migrationsUpTo,
} from '../support/migrations-up-to';

const SCRATCH_DATABASE = 'lorkarium_sheets_library_migration';
const LAST_MIGRATION_BEFORE = '0073_token_sheets';
const SHEETS_IN_LIBRARY = '0074_sheets_in_library';
const CAMPAIGN = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
const SCENE = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
const LYRA = '3d4e5f6a-7b8c-4d9e-8f0a-1b2c3d4e5f6a';
const TORMENTA = '4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b';
const SHEET = '5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c';
const FOLDER = '6a7b8c9d-0e1f-4a2b-9c3d-4e5f6a7b8c9d';

// A table at 0073 with Lyra on a grid holding the sheet of Ficha Tormenta.
async function seedSheetAt0073(scratch: DatabaseConnection): Promise<void> {
  const ownerId = await insertUserAtOldMigration(scratch.db, { email: 'ana@mesa.com' });
  await scratch.db.execute(sql`
    INSERT INTO campaigns (id, owner_id, name, join_code)
    VALUES (${CAMPAIGN}, ${ownerId}, 'Vharn', 'VHRN7K2Q')`);
  await scratch.db.execute(
    sql`INSERT INTO scenes (id, campaign_id) VALUES (${SCENE}, ${CAMPAIGN})`,
  );
  await scratch.db.execute(sql`
    INSERT INTO tokens (id, scene_id, name, initials, side, col, row)
    VALUES (${LYRA}, ${SCENE}, 'Lyra', 'LY', 'ally', 3, 4)`);
  await scratch.db.execute(sql`
    INSERT INTO sheet_templates (id, campaign_id, name, html, css, js)
    VALUES (${TORMENTA}, ${CAMPAIGN}, 'Ficha Tormenta', '<p></p>', '', '')`);
  await scratch.db.execute(sql`
    INSERT INTO token_sheets (id, campaign_id, template_id, token_id, values)
    VALUES (${SHEET}, ${CAMPAIGN}, ${TORMENTA}, ${LYRA}, '{"forca":16}'::jsonb)`);
}

// Raw SQL, not the DAO: the DAO reads the columns of every later migration.
describe('migration 0074_sheets_in_library on a sheet in use', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;
  let beforeFolder: string;
  let libraryFolder: string;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH_DATABASE}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH_DATABASE));
    beforeFolder = await migrationsUpTo(LAST_MIGRATION_BEFORE);
    libraryFolder = await migrationsUpTo(SHEETS_IN_LIBRARY);
    await migrate(scratch.db, { migrationsFolder: beforeFolder });
    await seedSheetAt0073(scratch);
    await migrate(scratch.db, { migrationsFolder: libraryFolder });
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.close();
    await rm(beforeFolder, { recursive: true, force: true });
    await rm(libraryFolder, { recursive: true, force: true });
  });

  it('names the old sheet after its template, at the root, on its token, values kept', async () => {
    const { rows } = await scratch.db.execute(sql`
      SELECT name, folder_id, token_id, values FROM token_sheets WHERE id = ${SHEET}`);
    expect(rows).toEqual([
      { name: 'Ficha Tormenta', folder_id: null, token_id: LYRA, values: { forca: 16 } },
    ]);
  });

  it('a token holds a second sheet, and a sheet may have no holder', async () => {
    await scratch.db.execute(sql`
      INSERT INTO token_sheets (campaign_id, template_id, name, token_id)
      VALUES (${CAMPAIGN}, ${TORMENTA}, 'Diário', ${LYRA}), (${CAMPAIGN}, ${TORMENTA}, 'Goblin', NULL)`);
    const { rows } = await scratch.db.execute(sql`
      SELECT count(*)::int AS total FROM token_sheets WHERE token_id = ${LYRA}`);
    expect(rows).toEqual([{ total: 2 }]);
  });

  it('refuses a blank name and one of 61 characters', async () => {
    for (const name of ['', 'a'.repeat(61)]) {
      const insert = scratch.db.execute(sql`
        INSERT INTO token_sheets (campaign_id, template_id, name) VALUES (${CAMPAIGN}, ${TORMENTA}, ${name})`);
      await expect(insert).rejects.toMatchObject({
        cause: expect.objectContaining({ constraint: 'token_sheets_name_length' }),
      });
    }
  });

  it('deleting the folder keeps the sheet in its table; deleting the token keeps the sheet', async () => {
    await scratch.db.execute(sql`
      INSERT INTO scene_folders (id, campaign_id, name) VALUES (${FOLDER}, ${CAMPAIGN}, 'Ato 1')`);
    await scratch.db.execute(
      sql`UPDATE token_sheets SET folder_id = ${FOLDER} WHERE id = ${SHEET}`,
    );

    await scratch.db.execute(sql`DELETE FROM scene_folders WHERE id = ${FOLDER}`);
    await scratch.db.execute(sql`DELETE FROM tokens WHERE id = ${LYRA}`);

    const { rows } = await scratch.db.execute(sql`
      SELECT campaign_id, folder_id, token_id FROM token_sheets WHERE id = ${SHEET}`);
    expect(rows).toEqual([{ campaign_id: CAMPAIGN, folder_id: null, token_id: null }]);
  });
});
