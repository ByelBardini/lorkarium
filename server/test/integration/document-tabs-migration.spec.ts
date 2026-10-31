import { rm } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readEnv } from '../../src/config/env';
import { createDatabase, type DatabaseConnection } from '../../src/database/database';
import { documentText } from '../support/document-http';
import {
  databaseUrlNamed,
  insertUserAtOldMigration,
  migrationsUpTo,
} from '../support/migrations-up-to';

const SCRATCH_DATABASE = 'lorkarium_document_tabs_migration';
const LAST_MIGRATION_BEFORE_TABS = '0069_library_documents';
const TAB_ASSETS_MIGRATION = '0071_document_tab_assets';
const CAMPAIGN = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
const CARTA = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
const PORTRAIT = '3d4e5f6a-7b8c-4d9e-8f0a-1b2c3d4e5f6a';
const DRAFT = '4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b';

// A table at 0069 with the document "Carta": its body shows the portrait, and a draft image was
// uploaded but never saved into the body.
async function seedDocumentAt0069(scratch: DatabaseConnection): Promise<void> {
  const ownerId = await insertUserAtOldMigration(scratch.db, { email: 'ana@mesa.com' });
  await scratch.db.execute(sql`
    INSERT INTO campaigns (id, owner_id, name, join_code)
    VALUES (${CAMPAIGN}, ${ownerId}, 'Vharn', 'VHRN7K2Q')`);
  await scratch.db.execute(sql`
    INSERT INTO assets (id, campaign_id, owner_id, purpose, mime_type, size_bytes, width, height, storage_key)
    VALUES (${PORTRAIT}::uuid, ${CAMPAIGN}::uuid, ${ownerId}::uuid, 'document_image', 'image/webp', 10, 4, 4, 'k1'),
           (${DRAFT}::uuid, ${CAMPAIGN}::uuid, ${ownerId}::uuid, 'document_image', 'image/webp', 10, 4, 4, 'k2')`);
  await scratch.db.execute(sql`
    INSERT INTO library_documents (id, campaign_id, name, content)
    VALUES (${CARTA}, ${CAMPAIGN}, 'Carta', ${JSON.stringify(documentText('Querida Lyra'))}::jsonb)`);
  await scratch.db.execute(sql`
    INSERT INTO library_document_assets (campaign_id, document_id, asset_id, in_content)
    VALUES (${CAMPAIGN}, ${CARTA}, ${PORTRAIT}, true), (${CAMPAIGN}, ${CARTA}, ${DRAFT}, false)`);
}

describe('migrations 0070_document_tabs and 0071_document_tab_assets on a document in use', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;
  let beforeFolder: string;
  let tabsFolder: string;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH_DATABASE}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH_DATABASE));
    beforeFolder = await migrationsUpTo(LAST_MIGRATION_BEFORE_TABS);
    tabsFolder = await migrationsUpTo(TAB_ASSETS_MIGRATION);
    await migrate(scratch.db, { migrationsFolder: beforeFolder });
    await seedDocumentAt0069(scratch);
    await migrate(scratch.db, { migrationsFolder: tabsFolder });
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.close();
    await rm(beforeFolder, { recursive: true, force: true });
    await rm(tabsFolder, { recursive: true, force: true });
  });

  // Raw SQL, not the DAO: the DAO reads the columns of every later migration.
  it('turns the body into exactly one "Geral" tab with the same JSON', async () => {
    const tabs = await scratch.db.execute(sql`
      SELECT name, position, visibility, content, schema_version, version
      FROM library_document_tabs WHERE document_id = ${CARTA}`);
    expect(tabs.rows).toEqual([
      {
        name: 'Geral',
        position: 0,
        visibility: 'document',
        content: documentText('Querida Lyra'),
        schema_version: 1,
        version: 0,
      },
    ]);
  });

  it('drops the body columns of the document, leaving the tab as the only source', async () => {
    const columns = await scratch.db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'library_documents' AND column_name IN ('content', 'schema_version')`);
    expect(columns.rows).toEqual([]);
  });

  it('moves the confirmed and the draft image references into the "Geral" tab', async () => {
    const references = await scratch.db.execute(sql`
      SELECT r.asset_id, r.in_content, t.name AS tab FROM library_document_assets r
      JOIN library_document_tabs t ON t.campaign_id = r.campaign_id AND t.id = r.tab_id
      ORDER BY r.in_content DESC`);
    expect(references.rows).toEqual([
      { asset_id: PORTRAIT, in_content: true, tab: 'Geral' },
      { asset_id: DRAFT, in_content: false, tab: 'Geral' },
    ]);
  });

  it('keeps the folder foreign keys of the library with SET NULL on folder_id only', async () => {
    const definitions = await scratch.db.execute(sql`
      SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conname IN ('library_documents_folder_fk')`);
    expect(definitions.rows).toEqual([
      { definition: expect.stringContaining('ON DELETE SET NULL (folder_id)') },
    ]);
  });
});
