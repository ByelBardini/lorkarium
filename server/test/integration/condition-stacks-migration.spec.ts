import { rm } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readEnv } from '../../src/config/env';
import { createDatabase, type DatabaseConnection } from '../../src/database/database';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { newUserPo } from '../support/auth-factories';
import { databaseUrlNamed, migrationsUpTo } from '../support/migrations-up-to';

const SCRATCH_DATABASE = 'lorkarium_condition_stacks_migration';
const LAST_MIGRATION_BEFORE_STACKS = '0050_condition_descriptions';
const STACKS_MIGRATION = '0051_condition_stacks';

const CAMPAIGN = '8d9e0f1a-2b3c-4d4e-9f5a-6b7c8d9e0f1a';
const SCENE = '9e0f1a2b-3c4d-4e5f-8a6b-7c8d9e0f1a2b';
const KAEL = '0f1a2b3c-4d5e-4f6a-9b7c-8d9e0f1a2b3c';

// A table at 0050 with Cego and Sangrando, both on Kael.
async function seedConditionsAt0050(scratch: DatabaseConnection): Promise<void> {
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
    INSERT INTO condition_definitions (campaign_id, name, tone, icon, description)
    VALUES (${CAMPAIGN}, 'Cego', 'harm', 'eye-off', ''),
           (${CAMPAIGN}, 'Sangrando', 'harm', 'droplet', 'Perde 1 PV por turno.')`);
  await scratch.db.execute(sql`
    INSERT INTO active_conditions (token_id, condition_id, remaining_rounds)
    SELECT ${KAEL}, id, 2 FROM condition_definitions`);
}

describe('migration 0051_condition_stacks on a table with conditions in use', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;
  let beforeFolder: string;
  let stacksFolder: string;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH_DATABASE}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH_DATABASE));
    beforeFolder = await migrationsUpTo(LAST_MIGRATION_BEFORE_STACKS);
    stacksFolder = await migrationsUpTo(STACKS_MIGRATION);
    await migrate(scratch.db, { migrationsFolder: beforeFolder });
    await seedConditionsAt0050(scratch);
    await migrate(scratch.db, { migrationsFolder: stacksFolder });
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.close();
    await rm(beforeFolder, { recursive: true, force: true });
    await rm(stacksFolder, { recursive: true, force: true });
  });

  // Raw SQL, not the DAO: the DAO reads the columns of every later migration (0052 color…).
  it('keeps every definition and its description, none of them stacking (max null)', async () => {
    const listed = await scratch.db.execute(sql`
      SELECT name, description, max_stacks FROM condition_definitions
      WHERE campaign_id = ${CAMPAIGN} ORDER BY name`);

    expect(listed.rows).toEqual([
      { name: 'Cego', description: '', max_stacks: null },
      { name: 'Sangrando', description: 'Perde 1 PV por turno.', max_stacks: null },
    ]);
  });

  it('keeps both conditions on Kael with their rounds, each with 1 stack', async () => {
    const active = await scratch.db.execute(sql`
      SELECT d.name, a.remaining_rounds, a.stacks
      FROM active_conditions a JOIN condition_definitions d ON d.id = a.condition_id
      WHERE a.token_id = ${KAEL} ORDER BY d.name`);

    expect(active.rows).toEqual([
      { name: 'Cego', remaining_rounds: 2, stacks: 1 },
      { name: 'Sangrando', remaining_rounds: 2, stacks: 1 },
    ]);
  });
});
