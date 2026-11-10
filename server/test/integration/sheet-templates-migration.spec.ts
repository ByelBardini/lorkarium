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

const SCRATCH_DATABASE = 'lorkarium_sheet_template_files_migration';
const LAST_MIGRATION_BEFORE = '0098_sheet_template_manifest';
const TEMPLATE_FILES = '0099_sheet_template_files';
const CAMPAIGN = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
const TORMENTA = '4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b';
const EMPTY = '5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c';
const HTML = '<p id="pv">PV</p>\n<button id="dano">−5 PV</button>';
const CSS = 'p { color: #e2c793; }';
const JS = 'lorkarium.onState(() => {});\nlorkarium.ready();';

// A table at 0098 with Ficha Tormenta (code in the three columns) and one with no code at all.
async function seedTemplatesAt0098(scratch: DatabaseConnection): Promise<void> {
  const ownerId = await insertUserAtOldMigration(scratch.db, { email: 'ana@mesa.com' });
  await scratch.db.execute(sql`
    INSERT INTO campaigns (id, owner_id, name, join_code)
    VALUES (${CAMPAIGN}, ${ownerId}, 'Vharn', 'VHRN7K2Q')`);
  await scratch.db.execute(sql`
    INSERT INTO sheet_templates (id, campaign_id, name, html, css, js, version)
    VALUES (${TORMENTA}, ${CAMPAIGN}, 'Ficha Tormenta', ${HTML}, ${CSS}, ${JS}, 4),
           (${EMPTY}, ${CAMPAIGN}, 'Vazio', '', '', '', 0)`);
}

// Raw SQL, not the DAO: the DAO reads the columns of every later migration.
describe('migration 0099_sheet_template_files on templates in use', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;
  let beforeFolder: string;
  let filesFolder: string;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH_DATABASE}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH_DATABASE));
    beforeFolder = await migrationsUpTo(LAST_MIGRATION_BEFORE);
    filesFolder = await migrationsUpTo(TEMPLATE_FILES);
    await migrate(scratch.db, { migrationsFolder: beforeFolder });
    await seedTemplatesAt0098(scratch);
    await migrate(scratch.db, { migrationsFolder: filesFolder });
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.close();
    await rm(beforeFolder, { recursive: true, force: true });
    await rm(filesFolder, { recursive: true, force: true });
  });

  it('turns the old code into index.html, style.css and script.js with the same text', async () => {
    const { rows } = await scratch.db.execute(sql`
      SELECT files, version FROM sheet_templates WHERE id = ${TORMENTA}`);
    expect(rows).toEqual([
      {
        files: [
          { path: 'index.html', content: HTML },
          { path: 'style.css', content: CSS },
          { path: 'script.js', content: JS },
        ],
        version: 4,
      },
    ]);
  });

  it('keeps the three files of a template that had no code', async () => {
    const { rows } = await scratch.db.execute(sql`
      SELECT files FROM sheet_templates WHERE id = ${EMPTY}`);
    expect(rows[0]?.files).toEqual([
      { path: 'index.html', content: '' },
      { path: 'style.css', content: '' },
      { path: 'script.js', content: '' },
    ]);
  });

  it('drops the html, css and js columns and refuses a template without files', async () => {
    const { rows } = await scratch.db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'sheet_templates' AND column_name IN ('html', 'css', 'js', 'files')`);
    expect(rows.map(({ column_name }) => column_name)).toEqual(['files']);
    await expect(
      scratch.db.execute(sql`
        INSERT INTO sheet_templates (campaign_id, name) VALUES (${CAMPAIGN}, 'Sem arquivos')`),
    ).rejects.toThrow();
  });
});
