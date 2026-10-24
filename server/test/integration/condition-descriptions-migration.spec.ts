import { rm } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readEnv } from '../../src/config/env';
import { createDatabase, type DatabaseConnection } from '../../src/database/database';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { ConditionsDao } from '../../src/modules/conditions/conditions.dao';
import { newUserPo } from '../support/auth-factories';
import { databaseUrlNamed, migrationsUpTo } from '../support/migrations-up-to';

const SCRATCH_DATABASE = 'lorkarium_condition_descriptions_migration';
const LAST_MIGRATION_BEFORE_DESCRIPTIONS = '0049_campaign_spectators';
const DESCRIPTIONS_MIGRATION = '0050_condition_descriptions';

const CAMPAIGN = '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d';
const SCENE = '6b7c8d9e-0f1a-4b2c-9d3e-4f5a6b7c8d9e';
const KAEL = '7c8d9e0f-1a2b-4c3d-8e4f-5a6b7c8d9e0f';

// A table at 0049 with Cego and a condition of the master, Sangrando, on Kael.
async function seedConditionsAt0049(scratch: DatabaseConnection): Promise<void> {
  const ownerId = (await new UsersDao(scratch.db).insert(newUserPo({ email: 'ana@mesa.com' }))).id;
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
    const listed = await new ConditionsDao(scratch.db).listDefinitions(CAMPAIGN);

    expect(listed.map(({ name, description }) => [name, description])).toEqual([
      ['Cego', ''],
      ['Sangrando', ''],
    ]);
  });

  it('keeps the condition on Kael, its rounds and the empty description of its definition', async () => {
    const active = await new ConditionsDao(scratch.db).listOfTokens([KAEL]);

    expect(active).toEqual([
      expect.objectContaining({ name: 'Sangrando', remainingRounds: 2, description: '' }),
    ]);
  });
});
