import { rm } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readEnv } from '../../src/config/env';
import { createDatabase, type DatabaseConnection } from '../../src/database/database';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { newUserPo } from '../support/auth-factories';
import { databaseUrlNamed, migrationsUpTo } from '../support/migrations-up-to';

const SCRATCH_DATABASE = 'lorkarium_campaign_settings_migration';
const LAST_MIGRATION_BEFORE_SETTINGS = '0047_password_resets';
const SETTINGS_MIGRATION = '0048_campaign_settings';

type MigratedCampaign = {
  name: string;
  status: string;
  cover_drawing: number | null;
  cover_tone: number | null;
  cover_asset_id: string | null;
  content_warnings: string[];
  tags: string[];
};

// The labels the old client offered, a free text and no status at all.
async function seedCampaignsAt0047(scratch: DatabaseConnection, ownerId: string): Promise<void> {
  await scratch.db.execute(sql`
    INSERT INTO campaigns (owner_id, name, join_code, status) VALUES
      (${ownerId}, 'Recrutando', 'OLD00001', 'Recrutando'),
      (${ownerId}, 'Em andamento', 'OLD00002', 'Em andamento'),
      (${ownerId}, 'Finalizada', 'OLD00003', 'Finalizada'),
      (${ownerId}, 'Texto livre', 'OLD00004', 'Pausada'),
      (${ownerId}, 'Sem status', 'OLD00005', NULL)`);
}

describe('migration 0048_campaign_settings on a database with campaigns', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;
  let beforeFolder: string;
  let settingsFolder: string;
  let ownerId: string;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH_DATABASE}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH_DATABASE));
    beforeFolder = await migrationsUpTo(LAST_MIGRATION_BEFORE_SETTINGS);
    settingsFolder = await migrationsUpTo(SETTINGS_MIGRATION);
    await migrate(scratch.db, { migrationsFolder: beforeFolder });
    ownerId = (await new UsersDao(scratch.db).insert(newUserPo())).id;
    await seedCampaignsAt0047(scratch, ownerId);
    await migrate(scratch.db, { migrationsFolder: settingsFolder });
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.close();
    await rm(beforeFolder, { recursive: true, force: true });
    await rm(settingsFolder, { recursive: true, force: true });
  });

  it('turns the free-text status into the enum and fills the new columns with their defaults', async () => {
    const { rows } = await scratch.db.execute<MigratedCampaign>(sql`
      SELECT name, status, cover_drawing, cover_tone, cover_asset_id, content_warnings, tags
      FROM campaigns WHERE join_code LIKE 'OLD%' ORDER BY join_code`);
    const empty = { cover_drawing: null, cover_tone: null, cover_asset_id: null };
    const lists = { content_warnings: [], tags: [] };
    expect(rows).toEqual([
      { name: 'Recrutando', status: 'recruiting', ...empty, ...lists },
      { name: 'Em andamento', status: 'ongoing', ...empty, ...lists },
      { name: 'Finalizada', status: 'finished', ...empty, ...lists },
      { name: 'Texto livre', status: 'building', ...empty, ...lists },
      { name: 'Sem status', status: 'building', ...empty, ...lists },
    ]);
  });

  it('a campaign inserted afterwards without a status is "building"', async () => {
    await scratch.db.execute(sql`
      INSERT INTO campaigns (owner_id, name, join_code) VALUES (${ownerId}, 'Nova', 'NEW00001')`);
    const { rows } = await scratch.db.execute<{ status: string }>(sql`
      SELECT status FROM campaigns WHERE join_code = 'NEW00001'`);
    expect(rows).toEqual([{ status: 'building' }]);
  });
});
