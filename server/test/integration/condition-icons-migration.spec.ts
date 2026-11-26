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

const SCRATCH_DATABASE = 'lorkarium_condition_icons_migration';
const LAST_MIGRATION_BEFORE_GAME_ICONS = '0127_round_cycles';
const GAME_ICONS_MIGRATION = '0128_condition_game_icons';

const QUELM = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';
const VHARN = '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b';
const VHARN_SCENE = '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f';
const KAEL = '4d5e6f7a-8b9c-4dae-9f2a-3b4c5d6e7f80';

type IconRow = Readonly<{ name: string; icon: string }>;

// Quelm keeps its defaults as they were born, with "cego" typed in lowercase; Vharn's master
// changed Cego to a skull and made an "Assombrado" with the ghost of Invisível. Kael has three.
async function seedTablesAt0127(scratch: DatabaseConnection): Promise<void> {
  const owner = await insertUserAtOldMigration(scratch.db, { name: 'Ana', email: 'ana@mesa.com' });
  await scratch.db.execute(sql`
    INSERT INTO campaigns (id, owner_id, name, join_code)
    VALUES (${QUELM}, ${owner}, 'Quelm', 'QLM7K2QA'), (${VHARN}, ${owner}, 'Vharn', 'VHRN7K2Q')`);
  await scratch.db.execute(sql`
    INSERT INTO condition_definitions (campaign_id, name, tone, icon)
    VALUES (${QUELM}, 'cego', 'harm', 'eye-off'),
           (${QUELM}, 'Imobilizado', 'harm', 'link'),
           (${QUELM}, 'Abençoado', 'benefit', 'sparkles'),
           (${VHARN}, 'Cego', 'harm', 'skull'),
           (${VHARN}, 'Invisível', 'benefit', 'ghost'),
           (${VHARN}, 'Assombrado', 'harm', 'ghost'),
           (${VHARN}, 'Caído', 'harm', 'arrow-down-to-line')`);
  await scratch.db.execute(
    sql`INSERT INTO scenes (id, campaign_id) VALUES (${VHARN_SCENE}, ${VHARN})`,
  );
  await scratch.db.execute(sql`
    INSERT INTO tokens (id, scene_id, name, initials, side, col, row)
    VALUES (${KAEL}, ${VHARN_SCENE}, 'Kael', 'KA', 'ally', 0, 0)`);
  await scratch.db.execute(sql`
    INSERT INTO active_conditions (token_id, condition_id, remaining_rounds)
    SELECT ${KAEL}, id, 2 FROM condition_definitions
    WHERE campaign_id = ${VHARN} AND name IN ('Cego', 'Invisível', 'Caído')`);
}

describe('migration 0128_condition_game_icons on two old tables', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;
  let beforeFolder: string;
  let iconsFolder: string;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH_DATABASE}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH_DATABASE));
    beforeFolder = await migrationsUpTo(LAST_MIGRATION_BEFORE_GAME_ICONS);
    iconsFolder = await migrationsUpTo(GAME_ICONS_MIGRATION);
    await migrate(scratch.db, { migrationsFolder: beforeFolder });
    await seedTablesAt0127(scratch);
    await migrate(scratch.db, { migrationsFolder: iconsFolder });
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.close();
    await rm(beforeFolder, { recursive: true, force: true });
    await rm(iconsFolder, { recursive: true, force: true });
  });

  async function iconsOf(campaignId: string): Promise<Record<string, string>> {
    const { rows } = await scratch.db.execute<IconRow>(
      sql`SELECT name, icon FROM condition_definitions WHERE campaign_id = ${campaignId}`,
    );
    return Object.fromEntries(rows.map(({ name, icon }) => [name, icon]));
  }

  it('a default still on its icon of always moves to its Game-icon, the lowercase name too', async () => {
    expect(await iconsOf(QUELM)).toEqual({
      cego: 'game-icons:blindfold',
      Imobilizado: 'game-icons:manacles',
      Abençoado: 'game-icons:spiked-halo',
    });
  });

  it('the icon the master changed stays, and a condition out of the list keeps its own', async () => {
    expect(await iconsOf(VHARN)).toEqual({
      Cego: 'skull',
      Invisível: 'game-icons:invisible',
      Assombrado: 'ghost',
      Caído: 'game-icons:falling',
    });
  });

  it('the active conditions still point at their definitions and show the new icon', async () => {
    const { rows } = await scratch.db.execute<IconRow>(sql`
      SELECT d.name, d.icon FROM active_conditions a
      JOIN condition_definitions d ON d.id = a.condition_id WHERE a.token_id = ${KAEL}`);
    expect(Object.fromEntries(rows.map(({ name, icon }) => [name, icon]))).toEqual({
      Cego: 'skull',
      Invisível: 'game-icons:invisible',
      Caído: 'game-icons:falling',
    });
  });
});
