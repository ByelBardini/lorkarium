import { rm } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readEnv } from '../../src/config/env';
import { createDatabase, type DatabaseConnection } from '../../src/database/database';
import {
  databaseUrlNamed,
  migrationsUpTo,
  insertUserAtOldMigration,
} from '../support/migrations-up-to';

const SCRATCH_DATABASE = 'lorkarium_condition_descriptions_migration';
const LAST_MIGRATION_BEFORE_DESCRIPTIONS = '0049_campaign_spectators';
const DESCRIPTIONS_MIGRATION = '0050_condition_descriptions';

const CAMPAIGN = '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d';
const SCENE = '6b7c8d9e-0f1a-4b2c-9d3e-4f5a6b7c8d9e';
const KAEL = '7c8d9e0f-1a2b-4c3d-8e4f-5a6b7c8d9e0f';

// A table at 0049 with Cego and a condition of the master, Sangrando, on Kael.
async function seedConditionsAt0049(scratch: DatabaseConnection): Promise<void> {
  const ownerId = await insertUserAtOldMigration(scratch.db, { email: 'ana@mesa.com' });
  await scratch.db.execute(sql`
    INSERT INTO campaigns (id, owner_id, name, join_code)
    VALUES (${CAMPAIGN}, ${ownerId}, 'Vharn', 'VHRN7K2Q')`);
  await scratch.db.execute(
    sql`INSERT INTO scenes (id, campaign_id) VALUES (${SCENE}, ${CAMPAIGN})`,
  );
  await scratch.db.execute(sql`
    INSERT INTO tokens (id, scene_id, name, initials, side, col, row)
    VALUES (${KAEL}, ${SCENE}, 'Kael', 'KA', 'ally', 0, 0)`);
  await scratch.db.execute(sql`
    INSERT INTO condition_definitions (campaign_id, name, tone, icon)
    VALUES (${CAMPAIGN}, 'Cego', 'harm', 'eye-off'),
           (${CAMPAIGN}, 'Sangrando', 'harm', 'droplet')`);
  await scratch.db.execute(sql`
    INSERT INTO active_conditions (token_id, condition_id, remaining_rounds)
    SELECT ${KAEL}, id, 2 FROM condition_definitions WHERE name = 'Sangrando'`);
}

describe('migration 0050_condition_descriptions on a table with conditions in use', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;
  let beforeFolder: string;
  let descriptionsFolder: string;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH_DATABASE}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH_DATABASE));
    beforeFolder = await migrationsUpTo(LAST_MIGRATION_BEFORE_DESCRIPTIONS);
    descriptionsFolder = await migrationsUpTo(DESCRIPTIONS_MIGRATION);
    await migrate(scratch.db, { migrationsFolder: beforeFolder });
    await seedConditionsAt0049(scratch);
    await migrate(scratch.db, { migrationsFolder: descriptionsFolder });
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.close();
    await rm(beforeFolder, { recursive: true, force: true });
    await rm(descriptionsFolder, { recursive: true, force: true });
  });

  it('keeps every definition, each with an empty description', async () => {
    // Raw SQL: the scratch stops at 0050 and the current DAO already asks for later columns (0052 color).
    const listed = await scratch.db.execute<{ name: string; description: string }>(sql`
      SELECT name, description FROM condition_definitions
      WHERE campaign_id = ${CAMPAIGN} ORDER BY name`);

    expect(listed.rows).toEqual([
      { name: 'Cego', description: '' },
      { name: 'Sangrando', description: '' },
    ]);
  });

  it('keeps the condition on Kael, its rounds and the empty description of its definition', async () => {
    const active = await scratch.db.execute<{
      name: string;
      remaining_rounds: number;
      description: string;
    }>(sql`
      SELECT d.name, a.remaining_rounds, d.description
      FROM active_conditions a JOIN condition_definitions d ON d.id = a.condition_id
      WHERE a.token_id = ${KAEL}`);

    expect(active.rows).toEqual([{ name: 'Sangrando', remaining_rounds: 2, description: '' }]);
  });
});
