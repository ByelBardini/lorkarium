import { rm } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readEnv } from '../../src/config/env';
import { createDatabase, type DatabaseConnection } from '../../src/database/database';
import { DEFAULT_CONDITIONS } from '../../src/modules/conditions/condition-rules.bo';
import {
  databaseUrlNamed,
  LAST_MIGRATION_WITH_PLAIN_EMAIL,
  migrationsUpTo,
} from '../support/migrations-up-to';

const SCRATCH_DATABASE = 'lorkarium_scenes_migration';
const LAST_MIGRATION_BEFORE_SCENES = '0001_campaigns';

describe('migrations 0002_scenes, 0004_conditions and 0009_condition_icons on a database with campaigns', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;
  let partialFolder: string;
  // Not every migration: 0039 refuses the raw users these specs seed, which never got a cipher.
  let laterFolder: string;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH_DATABASE}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH_DATABASE));
    partialFolder = await migrationsUpTo(LAST_MIGRATION_BEFORE_SCENES);
    laterFolder = await migrationsUpTo(LAST_MIGRATION_WITH_PLAIN_EMAIL);
    await migrate(scratch.db, { migrationsFolder: partialFolder });
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.close();
    await rm(partialFolder, { recursive: true, force: true });
    await rm(laterFolder, { recursive: true, force: true });
  });

  it('a campaign created before the migrations gets its active 20×12 scene and the 11 initial conditions with their icons', async () => {
    await scratch.db.execute(sql`
      INSERT INTO users (id, name, email, password_hash)
      VALUES ('6a1d2c3b-4e5f-4a7b-8c9d-0e1f2a3b4c5d', 'Ana', 'ana@x.com', 'hash')`);
    await scratch.db.execute(sql`
      INSERT INTO campaigns (id, owner_id, name, join_code)
      VALUES ('3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10', '6a1d2c3b-4e5f-4a7b-8c9d-0e1f2a3b4c5d',
              'Vharn', 'VHRN7K2Q')`);
    await migrate(scratch.db, { migrationsFolder: laterFolder });
    const { rows } = await scratch.db.execute<{ width_cells: number; height_cells: number }>(sql`
      SELECT s.width_cells, s.height_cells FROM campaigns c
      JOIN scenes s ON s.id = c.active_scene_id AND s.campaign_id = c.id`);
    expect(rows).toEqual([{ width_cells: 20, height_cells: 12 }]);
    const conditions = await scratch.db.execute<{ total: number }>(sql`
      SELECT count(*)::int AS total FROM condition_definitions
      WHERE campaign_id = '3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10'`);
    expect(conditions.rows).toEqual([{ total: 11 }]);
    const icons = await scratch.db.execute<{ name: string; icon: string }>(sql`
      SELECT name, icon FROM condition_definitions ORDER BY name`);
    const expected = DEFAULT_CONDITIONS.map(({ name, icon }) => ({ name, icon }));
    expect(icons.rows).toEqual(expect.arrayContaining(expected));
  });
});
