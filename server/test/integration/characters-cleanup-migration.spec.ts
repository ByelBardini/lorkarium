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

const LAST_MIGRATION_BEFORE = '0074_sheets_in_library';
const CHARACTERS = '0075_characters';
const CLEANUP = '0076_characters_cleanup';

const VHARN = '10000000-0000-4000-8000-000000000001';
const QUELM = '10000000-0000-4000-8000-000000000002';
const VHARN_CAST = '20000000-0000-4000-8000-000000000001';
const SALAO = '20000000-0000-4000-8000-000000000002';
const QUELM_CAST = '20000000-0000-4000-8000-000000000003';
const QUELM_GRID = '20000000-0000-4000-8000-000000000004';
const LYRA_ANCHOR = '30000000-0000-4000-8000-000000000001';
const LYRA_SALAO = '30000000-0000-4000-8000-000000000002';
const GOBLIN = '30000000-0000-4000-8000-000000000003';
const SOMBRA_ANCHOR = '30000000-0000-4000-8000-000000000004';
const SOMBRA_GRID = '30000000-0000-4000-8000-000000000005';
const POISONED = '50000000-0000-4000-8000-000000000001';
const QUELM_BLIND = '50000000-0000-4000-8000-000000000002';
const TORMENTA = '60000000-0000-4000-8000-000000000001';
const DIARY = '60000000-0000-4000-8000-000000000002';

type Members = Readonly<{ ana: string; bia: string }>;

async function run(scratch: DatabaseConnection, query: ReturnType<typeof sql>): Promise<void> {
  await scratch.db.execute(query);
}

async function rowsOf(scratch: DatabaseConnection, query: ReturnType<typeof sql>) {
  const { rows } = await scratch.db.execute<Record<string, unknown>>(query);
  return rows;
}

async function freshDatabase(admin: DatabaseConnection, name: string): Promise<DatabaseConnection> {
  await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${name}`));
  await admin.db.execute(sql.raw(`CREATE DATABASE ${name}`));
  return createDatabase(databaseUrlNamed(name));
}

async function seedTables(scratch: DatabaseConnection): Promise<Members> {
  const ana = await insertUserAtOldMigration(scratch.db, { name: 'Ana', email: 'ana@mesa.com' });
  const bia = await insertUserAtOldMigration(scratch.db, { name: 'Bia', email: 'bia@mesa.com' });
  await run(
    scratch,
    sql`
    INSERT INTO campaigns (id, owner_id, name, join_code) VALUES
      (${VHARN}, ${ana}, 'Vharn', 'VHRN7K2Q'), (${QUELM}, ${ana}, 'Quelm', 'QLM4X9PZ')`,
  );
  await run(
    scratch,
    sql`
    INSERT INTO campaign_members (campaign_id, user_id, role) VALUES
      (${VHARN}, ${ana}, 'master'), (${VHARN}, ${bia}, 'player'),
      (${QUELM}, ${ana}, 'master'), (${QUELM}, ${bia}, 'player')`,
  );
  await run(
    scratch,
    sql`
    INSERT INTO scenes (id, campaign_id, name, kind) VALUES
      (${VHARN_CAST}, ${VHARN}, 'Elenco', 'cast'), (${SALAO}, ${VHARN}, 'Salão', 'grid'),
      (${QUELM_CAST}, ${QUELM}, 'Elenco', 'cast'), (${QUELM_GRID}, ${QUELM}, 'Torre', 'grid')`,
  );
  await run(
    scratch,
    sql`
    INSERT INTO condition_definitions (id, campaign_id, name, tone) VALUES
      (${POISONED}, ${VHARN}, 'Envenenado', 'harm'), (${QUELM_BLIND}, ${QUELM}, 'Cego', 'harm')`,
  );
  return { ana, bia };
}

// Lyra's anchor (PV, Bia in control, poisoned, a sheet) linked in the Salão, a free Goblin, Bia's
// card and her main token; Sombra's anchor of Quelm, linked in its Torre.
async function seedOldModel(scratch: DatabaseConnection, { bia }: Members): Promise<void> {
  await run(
    scratch,
    sql`
    INSERT INTO tokens (id, scene_id, name, initials, side, col, row, anchor_token_id) VALUES
      (${LYRA_ANCHOR}, ${VHARN_CAST}, 'Lyra', 'LY', 'ally', 0, 0, NULL),
      (${LYRA_SALAO}, ${SALAO}, 'Lyra', 'LY', 'ally', 3, 4, ${LYRA_ANCHOR}),
      (${GOBLIN}, ${SALAO}, 'Goblin', 'GO', 'enemy', 6, 6, NULL),
      (${SOMBRA_ANCHOR}, ${QUELM_CAST}, 'Sombra', 'SO', 'ally', 0, 0, NULL),
      (${SOMBRA_GRID}, ${QUELM_GRID}, 'Sombra', 'SO', 'ally', 1, 1, ${SOMBRA_ANCHOR})`,
  );
  await run(
    scratch,
    sql`
    INSERT INTO token_bars (token_id, position, label, current, max, color, visibility, display)
    VALUES (${LYRA_ANCHOR}, 0, 'PV', 25, 30, 'ember', 'controllers', 'number')`,
  );
  await run(
    scratch,
    sql`INSERT INTO token_controllers (token_id, user_id) VALUES (${LYRA_ANCHOR}, ${bia})`,
  );
  await run(
    scratch,
    sql`
    INSERT INTO active_conditions (token_id, condition_id, remaining_rounds) VALUES
      (${LYRA_ANCHOR}, ${POISONED}, 3), (${GOBLIN}, ${POISONED}, 1)`,
  );
  await run(
    scratch,
    sql`
    INSERT INTO sheet_templates (id, campaign_id, name, html, css, js)
    VALUES (${TORMENTA}, ${VHARN}, 'Ficha Tormenta', '<p></p>', '', '')`,
  );
  await run(
    scratch,
    sql`
    INSERT INTO token_sheets (id, campaign_id, template_id, name, token_id)
    VALUES (${DIARY}, ${VHARN}, ${TORMENTA}, 'Diário', ${LYRA_ANCHOR})`,
  );
  await run(
    scratch,
    sql`
    INSERT INTO member_cards (campaign_id, user_id, character_name, armor_class, anchor_token_id)
    VALUES (${VHARN}, ${bia}, 'Lyra', 15, ${LYRA_ANCHOR})`,
  );
  await run(
    scratch,
    sql`
    INSERT INTO main_tokens (scene_id, user_id, token_id) VALUES (${SALAO}, ${bia}, ${LYRA_SALAO})`,
  );
}

// The guard's message rides the cause: drizzle wraps the Postgres error in its own.
async function failureOf(running: Promise<unknown>): Promise<string> {
  try {
    await running;
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : '';
    return `${error instanceof Error ? error.message : String(error)} ${cause}`;
  }
  throw new Error('expected the migration to fail; it ran');
}

async function exists(scratch: DatabaseConnection, name: string): Promise<boolean> {
  const [row] = await rowsOf(scratch, sql`SELECT to_regclass(${name}) IS NOT NULL AS found`);
  return row?.found === true;
}

async function columnsOf(scratch: DatabaseConnection, table: string): Promise<string[]> {
  const rows = await rowsOf(
    scratch,
    sql`
    SELECT column_name FROM information_schema.columns WHERE table_name = ${table}`,
  );
  return rows.map((row) => String(row.column_name));
}

// Raw SQL, not the DAO: the DAO reads the columns of every later migration.
describe('migration 0076_characters_cleanup after 0075 moved the old model to the characters', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;
  const folders: string[] = [];
  let members: Members;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    scratch = await freshDatabase(admin, 'lorkarium_characters_cleanup');
    folders.push(await migrationsUpTo(LAST_MIGRATION_BEFORE), await migrationsUpTo(CLEANUP));
    await migrate(scratch.db, { migrationsFolder: folders[0] ?? '' });
    members = await seedTables(scratch);
    await seedOldModel(scratch, members);
    await migrate(scratch.db, { migrationsFolder: folders[1] ?? '' });
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw('DROP DATABASE IF EXISTS lorkarium_characters_cleanup'));
    await admin.close();
    for (const folder of folders) await rm(folder, { recursive: true, force: true });
  });

  it('member_cards, main_tokens, tokens.anchor_token_id, scenes.kind and scene_kind are gone', async () => {
    expect(await exists(scratch, 'member_cards')).toBe(false);
    expect(await exists(scratch, 'main_tokens')).toBe(false);
    expect(await columnsOf(scratch, 'tokens')).not.toContain('anchor_token_id');
    expect(await columnsOf(scratch, 'scenes')).not.toContain('kind');
    const types = await rowsOf(scratch, sql`SELECT 1 FROM pg_type WHERE typname = 'scene_kind'`);
    expect(types).toEqual([]);
  });

  it('the casts and their anchors are deleted; the grids and their tokens stay', async () => {
    const scenes = await rowsOf(scratch, sql`SELECT id FROM scenes ORDER BY id`);
    expect(scenes.map(({ id }) => id)).toEqual([SALAO, QUELM_GRID]);
    const tokens = await rowsOf(scratch, sql`SELECT id FROM tokens ORDER BY id`);
    expect(tokens.map(({ id }) => id)).toEqual([LYRA_SALAO, GOBLIN, SOMBRA_GRID]);
  });

  it("Lyra keeps her character's card, bar, control, condition and sheet, and her Salão token", async () => {
    const [lyra] = await rowsOf(
      scratch,
      sql`
      SELECT id, name, armor_class, main_sheet_id FROM characters WHERE user_id = ${members.bia} AND campaign_id = ${VHARN}`,
    );
    expect(lyra).toMatchObject({ name: 'Lyra', armor_class: 15, main_sheet_id: DIARY });
    const id = String(lyra?.id);
    const [token] = await rowsOf(
      scratch,
      sql`SELECT character_id FROM tokens WHERE id = ${LYRA_SALAO}`,
    );
    expect(token).toEqual({ character_id: id });
    expect(
      await rowsOf(
        scratch,
        sql`SELECT label, current FROM character_bars WHERE character_id = ${id}`,
      ),
    ).toEqual([{ label: 'PV', current: 25 }]);
    expect(
      await rowsOf(
        scratch,
        sql`SELECT user_id FROM character_controllers WHERE character_id = ${id}`,
      ),
    ).toEqual([{ user_id: members.bia }]);
    expect(
      await rowsOf(
        scratch,
        sql`SELECT remaining_rounds FROM active_conditions WHERE character_id = ${id}`,
      ),
    ).toEqual([{ remaining_rounds: 3 }]);
    expect(
      await rowsOf(
        scratch,
        sql`SELECT character_id, token_id FROM token_sheets WHERE id = ${DIARY}`,
      ),
    ).toEqual([{ character_id: id, token_id: null }]);
  });

  it("the condition list of each table survives, and so does the Goblin's own condition", async () => {
    const definitions = await rowsOf(
      scratch,
      sql`
      SELECT campaign_id, name FROM condition_definitions ORDER BY name`,
    );
    expect(definitions).toEqual([
      { campaign_id: QUELM, name: 'Cego' },
      { campaign_id: VHARN, name: 'Envenenado' },
    ]);
    const goblin = await rowsOf(
      scratch,
      sql`SELECT condition_id FROM active_conditions WHERE token_id = ${GOBLIN}`,
    );
    expect(goblin).toEqual([{ condition_id: POISONED }]);
  });

  it("Quelm keeps only its own: Sombra's character and token at Quelm, nothing of Vharn", async () => {
    const rows = await rowsOf(
      scratch,
      sql`
      SELECT c.name, t.id AS token_id FROM characters c
      JOIN tokens t ON t.character_id = c.id
      WHERE c.campaign_id = ${QUELM}`,
    );
    expect(rows).toEqual([{ name: 'Sombra', token_id: SOMBRA_GRID }]);
    const quelmTokens = await rowsOf(
      scratch,
      sql`
      SELECT t.id FROM tokens t JOIN scenes s ON s.id = t.scene_id WHERE s.campaign_id = ${QUELM}`,
    );
    expect(quelmTokens).toEqual([{ id: SOMBRA_GRID }]);
  });
});

describe('the guard of 0076 on what 0075 left on the old model', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;
  const folders: string[] = [];

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    scratch = await freshDatabase(admin, 'lorkarium_characters_cleanup_guard');
    folders.push(await migrationsUpTo(CHARACTERS), await migrationsUpTo(CLEANUP));
    await migrate(scratch.db, { migrationsFolder: folders[0] ?? '' });
    await seedTables(scratch);
    await run(
      scratch,
      sql`
      INSERT INTO tokens (id, scene_id, name, initials, side, col, row, anchor_token_id) VALUES
        (${LYRA_ANCHOR}, ${VHARN_CAST}, 'Lyra', 'LY', 'ally', 0, 0, NULL),
        (${LYRA_SALAO}, ${SALAO}, 'Lyra', 'LY', 'ally', 3, 4, ${LYRA_ANCHOR})`,
    );
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw('DROP DATABASE IF EXISTS lorkarium_characters_cleanup_guard'));
    await admin.close();
    for (const folder of folders) await rm(folder, { recursive: true, force: true });
  });

  const cleanup = () => migrate(scratch.db, { migrationsFolder: folders[1] ?? '' });

  it('a linked token without a character stops the migration citing the token and its anchor', async () => {
    expect(await failureOf(cleanup())).toContain(
      `token ${LYRA_SALAO} has anchor_token_id ${LYRA_ANCHOR} but no character_id`,
    );
    expect(await exists(scratch, 'member_cards')).toBe(true);
  });

  it('a sheet still on an anchor stops it citing the sheet; nothing was dropped', async () => {
    await run(scratch, sql`UPDATE tokens SET anchor_token_id = NULL WHERE id = ${LYRA_SALAO}`);
    await run(
      scratch,
      sql`
      INSERT INTO sheet_templates (id, campaign_id, name, html, css, js)
      VALUES (${TORMENTA}, ${VHARN}, 'Ficha Tormenta', '<p></p>', '', '')`,
    );
    await run(
      scratch,
      sql`
      INSERT INTO token_sheets (id, campaign_id, template_id, name, token_id)
      VALUES (${DIARY}, ${VHARN}, ${TORMENTA}, 'Diário', ${LYRA_ANCHOR})`,
    );

    expect(await failureOf(cleanup())).toContain(`sheet ${DIARY} is still held by anchor`);
    expect(await columnsOf(scratch, 'tokens')).toContain('anchor_token_id');
  });

  it('with nothing left on the old model it runs', async () => {
    await run(scratch, sql`UPDATE token_sheets SET token_id = NULL WHERE id = ${DIARY}`);

    await cleanup();

    expect(await columnsOf(scratch, 'scenes')).not.toContain('kind');
  });
});
