import { rm } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readEnv } from '../../src/config/env';
import { createDatabase, type DatabaseConnection } from '../../src/database/database';
import { ConditionsDao } from '../../src/modules/conditions/conditions.dao';
import {
  databaseUrlNamed,
  LAST_MIGRATION_WITH_PLAIN_EMAIL,
  migrationsUpTo,
} from '../support/migrations-up-to';

const SCRATCH_DATABASE = 'lorkarium_conditions_migration';
const LAST_MIGRATION_BEFORE_LOOKS = '0029_drawings_drop_layer';

const USER = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const CAMPAIGN = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';
const SCENE = '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f';
const KAEL = '4d5e6f7a-8b9c-4dae-9f2a-3b4c5d6e7f80';

// A table at 0029 with three of the initial conditions, one the master named "inconsciente" and
// one "Assombrado" that shares the ghost icon with Invisível; all of them on Kael.
async function seedConditionsAt0029(scratch: DatabaseConnection): Promise<void> {
  await scratch.db.execute(sql`
    INSERT INTO users (id, name, email, password_hash) VALUES (${USER}, 'Ana', 'ana@x.com', 'hash')`);
  await scratch.db.execute(sql`
    INSERT INTO campaigns (id, owner_id, name, join_code)
    VALUES (${CAMPAIGN}, ${USER}, 'Vharn', 'VHRN7K2Q')`);
  await scratch.db.execute(
    sql`INSERT INTO scenes (id, campaign_id) VALUES (${SCENE}, ${CAMPAIGN})`,
  );
  await scratch.db.execute(sql`
    INSERT INTO tokens (id, scene_id, name, initials, side, col, row)
    VALUES (${KAEL}, ${SCENE}, 'Kael', 'KA', 'ally', 0, 0)`);
  await scratch.db.execute(sql`
    INSERT INTO condition_definitions (campaign_id, name, tone, icon)
    VALUES (${CAMPAIGN}, 'Paralisado', 'harm', 'lock'),
           (${CAMPAIGN}, 'Atordoado', 'harm', 'zap'),
           (${CAMPAIGN}, 'Invisível', 'benefit', 'ghost'),
           (${CAMPAIGN}, 'inconsciente', 'harm', 'moon'),
           (${CAMPAIGN}, 'Assombrado', 'harm', 'ghost')`);
  await scratch.db.execute(sql`
    INSERT INTO active_conditions (token_id, condition_id, remaining_rounds)
    SELECT ${KAEL}, id, 2 FROM condition_definitions`);
}

describe('migration 0030_condition_looks', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection | undefined;
  let partialFolder: string;
  // Not every migration: 0039 refuses the raw users these specs seed, which never got a cipher.
  let laterFolder: string;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    partialFolder = await migrationsUpTo(LAST_MIGRATION_BEFORE_LOOKS);
    laterFolder = await migrationsUpTo(LAST_MIGRATION_WITH_PLAIN_EMAIL);
  });

  afterEach(async () => {
    await scratch?.close();
    scratch = undefined;
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
  });

  afterAll(async () => {
    await admin.close();
    await rm(partialFolder, { recursive: true, force: true });
    await rm(laterFolder, { recursive: true, force: true });
  });

  async function migratedFrom0029(): Promise<DatabaseConnection> {
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH_DATABASE}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH_DATABASE));
    await migrate(scratch.db, { migrationsFolder: partialFolder });
    await seedConditionsAt0029(scratch);
    await migrate(scratch.db, { migrationsFolder: laterFolder });
    return scratch;
  }

  it('marks the old tables by name: Paralisado and Atordoado incapacitating, Invisível and "inconsciente" with their look and tone, Assombrado untouched', async () => {
    const database = await migratedFrom0029();

    const listed = await new ConditionsDao(database.db).listDefinitions(CAMPAIGN);
    const byName = new Map(listed.map(({ name, tone, look }) => [name, { tone, look }]));
    expect(Object.fromEntries(byName)).toEqual({
      Paralisado: { tone: 'incapacitating', look: null },
      Atordoado: { tone: 'incapacitating', look: null },
      Invisível: { tone: 'benefit', look: 'invisible' },
      inconsciente: { tone: 'harm', look: 'unconscious' },
      Assombrado: { tone: 'harm', look: null },
    });
  });

  it('the active conditions stay on the tokens and carry the new tone and look', async () => {
    const database = await migratedFrom0029();

    const active = await new ConditionsDao(database.db).listOfTokens([KAEL]);
    expect(active).toHaveLength(5);
    expect(active).toContainEqual(
      expect.objectContaining({ name: 'Invisível', look: 'invisible', remainingRounds: 2 }),
    );
    expect(active).toContainEqual(
      expect.objectContaining({ name: 'Paralisado', tone: 'incapacitating', look: null }),
    );
  });
});
