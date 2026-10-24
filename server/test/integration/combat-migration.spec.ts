import { rm } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readEnv } from '../../src/config/env';
import { createDatabase, type DatabaseConnection } from '../../src/database/database';
import { CombatDao } from '../../src/modules/combat/combat.dao';
import {
  databaseUrlNamed,
  LAST_MIGRATION_WITH_PLAIN_EMAIL,
  migrationsUpTo,
} from '../support/migrations-up-to';

const SCRATCH_DATABASE = 'lorkarium_combat_migration';
const LAST_MIGRATION_BEFORE_GROUPS = '0018_token_sight';

const USER = '6a1d2c3b-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
const CAMPAIGN = '3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10';
const SCENE = '4c2f0b63-7d5e-4a9b-8f3c-2b8d6e4a9f21';
const KAEL = '5d3a1c74-8e6f-4bac-9a4d-3c9e7f5bab32';
const LYRA = '6e4b2d85-9f7a-4cbd-8b5e-4dafa06cbc43';
const COMBAT = '7f5c3e96-a08b-4dce-9c6f-5eb0b17dcd54';
const KAEL_ENTRY = '806d4fa7-b19c-4edf-8d7a-6fc1c28ede65';
const LYRA_ENTRY = '917e50b8-c2ad-4fe0-9e8b-70d2d39fef76';

// A table at 0018 fighting: Kael (18) and Lyra (not rolled), with the turn on Lyra in round 2.
async function seedCombatAt0018(scratch: DatabaseConnection): Promise<void> {
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
    VALUES (${KAEL}, ${SCENE}, 'Kael', 'KA', 'ally', 0, 0),
           (${LYRA}, ${SCENE}, 'Lyra', 'LY', 'ally', 1, 0)`);
  await scratch.db.execute(sql`
    INSERT INTO combats (id, scene_id, round, current_combatant_id)
    VALUES (${COMBAT}, ${SCENE}, 2, ${LYRA_ENTRY})`);
  await scratch.db.execute(sql`
    INSERT INTO combatants (id, combat_id, token_id, initiative, tie_order)
    VALUES (${KAEL_ENTRY}, ${COMBAT}, ${KAEL}, 18, 0),
           (${LYRA_ENTRY}, ${COMBAT}, ${LYRA}, NULL, 1)`);
}

describe('migrations 0019_combatant_tokens and 0020_combatants_drop_token', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection | undefined;
  let partialFolder: string;
  // Not every migration: 0039 refuses the raw users these specs seed, which never got a cipher.
  let laterFolder: string;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    partialFolder = await migrationsUpTo(LAST_MIGRATION_BEFORE_GROUPS);
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

  async function scratchAt0018(): Promise<DatabaseConnection> {
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH_DATABASE}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH_DATABASE));
    await migrate(scratch.db, { migrationsFolder: partialFolder });
    return scratch;
  }

  it('a combat started before the groups keeps each combatant as an unnamed entry of its own token, with the initiatives, the round and the turn', async () => {
    const database = await scratchAt0018();
    await seedCombatAt0018(database);

    await migrate(database.db, { migrationsFolder: laterFolder });

    const found = await new CombatDao(database.db).findOfScene(SCENE);
    expect(found?.combat).toMatchObject({ round: 2, currentCombatantId: LYRA_ENTRY });
    expect(found?.combatants).toEqual([
      expect.objectContaining({ id: KAEL_ENTRY, name: null, tokenIds: [KAEL], initiative: 18 }),
      expect.objectContaining({ id: LYRA_ENTRY, name: null, tokenIds: [LYRA], initiative: null }),
    ]);
  });

  it('a database without combat migrates without error and ends with no link', async () => {
    const database = await scratchAt0018();

    await migrate(database.db, { migrationsFolder: laterFolder });

    const links = await database.db.execute<{ total: number }>(
      sql`SELECT count(*)::int AS total FROM combatant_tokens`,
    );
    expect(links.rows).toEqual([{ total: 0 }]);
  });
});
