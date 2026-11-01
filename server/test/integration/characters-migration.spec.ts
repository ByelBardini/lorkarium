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

const SCRATCH_DATABASE = 'lorkarium_characters_migration';
const LAST_MIGRATION_BEFORE = '0074_sheets_in_library';
const CHARACTERS = '0075_characters';

const VHARN = '10000000-0000-4000-8000-000000000001';
const QUELM = '10000000-0000-4000-8000-000000000002';
const CAST = '20000000-0000-4000-8000-000000000001';
const SALAO = '20000000-0000-4000-8000-000000000002';
const ESTRADA = '20000000-0000-4000-8000-000000000003';
const LYRA_ANCHOR = '30000000-0000-4000-8000-000000000001';
const LYRA_SALAO = '30000000-0000-4000-8000-000000000002';
const LYRA_ESTRADA = '30000000-0000-4000-8000-000000000003';
const GORM_ANCHOR = '30000000-0000-4000-8000-000000000004';
const GORM_SALAO = '30000000-0000-4000-8000-000000000005';
const PORTRAIT = '40000000-0000-4000-8000-000000000001';
const POISONED = '50000000-0000-4000-8000-000000000001';
const TORMENTA = '60000000-0000-4000-8000-000000000001';
const OLD_SHEET = '60000000-0000-4000-8000-000000000002';
const DIARY = '60000000-0000-4000-8000-000000000003';
const ELF_FORM = '70000000-0000-4000-8000-000000000001';
const WOLF_FORM = '70000000-0000-4000-8000-000000000002';
const STALE_FORM = '70000000-0000-4000-8000-000000000003';

type Members = Readonly<{ ana: string; bia: string; caio: string; duda: string; eli: string }>;

async function seedMembers(scratch: DatabaseConnection): Promise<Members> {
  const user = (name: string, email: string) =>
    insertUserAtOldMigration(scratch.db, { name, email });
  const members = {
    ana: await user('Ana', 'ana@mesa.com'),
    bia: await user('Bia', 'bia@mesa.com'),
    caio: await user('Caio do Vale', 'caio@mesa.com'),
    duda: await user('Duda', 'duda@mesa.com'),
    eli: await user('Eli', 'eli@mesa.com'),
  };
  await scratch.db.execute(sql`
    INSERT INTO campaigns (id, owner_id, name, join_code) VALUES
      (${VHARN}, ${members.ana}, 'Vharn', 'VHRN7K2Q'), (${QUELM}, ${members.ana}, 'Quelm', 'QLM4X9PZ')`);
  await scratch.db.execute(sql`
    INSERT INTO campaign_members (campaign_id, user_id, role) VALUES
      (${VHARN}, ${members.ana}, 'master'), (${VHARN}, ${members.bia}, 'player'),
      (${VHARN}, ${members.caio}, 'player'), (${VHARN}, ${members.duda}, 'spectator'),
      (${VHARN}, ${members.eli}, 'player'), (${QUELM}, ${members.ana}, 'master'),
      (${QUELM}, ${members.bia}, 'player')`);
  return members;
}

async function seedScenes(scratch: DatabaseConnection, ana: string): Promise<void> {
  await scratch.db.execute(sql`
    INSERT INTO scenes (id, campaign_id, name, kind) VALUES
      (${CAST}, ${VHARN}, 'Elenco', 'cast'), (${SALAO}, ${VHARN}, 'Salão', 'grid'),
      (${ESTRADA}, ${VHARN}, 'Estrada', 'grid')`);
  await scratch.db.execute(sql`
    INSERT INTO assets (id, campaign_id, owner_id, purpose, mime_type, size_bytes, width, height, storage_key)
    VALUES (${PORTRAIT}, ${VHARN}, ${ana}, 'token', 'image/webp', 10, 256, 256, 'vharn/lyra.webp')`);
}

// Lyra's anchor in the cast (round, a gold aura, 2×2, PV 25/30, poisoned, Bia in control) and
// her two linked tokens; Gorm's anchor, whose player left the table, linked in the Salão.
async function seedAnchors(scratch: DatabaseConnection, bia: string): Promise<void> {
  await scratch.db.execute(sql`
    INSERT INTO tokens (id, scene_id, name, initials, side, col, row, width, height, image_asset_id,
      frame, aura_kind, aura_radius, aura_color, aura_opacity)
    VALUES (${LYRA_ANCHOR}, ${CAST}, 'Lyra', 'LY', 'ally', 0, 0, 2, 2, ${PORTRAIT}, 'round', 'color', 2, 'gold', 60),
      (${GORM_ANCHOR}, ${CAST}, 'Gorm', 'GO', 'neutral', 0, 0, 1, 1, NULL, 'square', NULL, NULL, NULL, NULL)`);
  await scratch.db.execute(sql`
    INSERT INTO tokens (id, scene_id, name, initials, side, col, row, anchor_token_id) VALUES
      (${LYRA_SALAO}, ${SALAO}, 'Lyra', 'LY', 'ally', 3, 4, ${LYRA_ANCHOR}),
      (${LYRA_ESTRADA}, ${ESTRADA}, 'Lyra', 'LY', 'ally', 7, 1, ${LYRA_ANCHOR}),
      (${GORM_SALAO}, ${SALAO}, 'Gorm', 'GO', 'neutral', 5, 5, ${GORM_ANCHOR})`);
  await scratch.db.execute(sql`
    INSERT INTO token_bars (token_id, position, label, current, max, color, visibility, display) VALUES
      (${LYRA_ANCHOR}, 0, 'PV', 25, 30, 'ember', 'controllers', 'number'),
      (${LYRA_ANCHOR}, 1, 'Mana', 4, 10, 'steel', 'everyone', 'percent')`);
  await scratch.db.execute(
    sql`INSERT INTO token_controllers (token_id, user_id) VALUES (${LYRA_ANCHOR}, ${bia})`,
  );
  await scratch.db.execute(sql`
    INSERT INTO condition_definitions (id, campaign_id, name, tone) VALUES (${POISONED}, ${VHARN}, 'Envenenado', 'harm')`);
  await scratch.db.execute(sql`
    INSERT INTO active_conditions (token_id, condition_id, remaining_rounds) VALUES (${LYRA_ANCHOR}, ${POISONED}, 3)`);
}

// The anchor's forms (the elf and the wolf, the wolf shown) and a form the Salão token kept from
// before it was linked, which nobody sees.
async function seedForms(scratch: DatabaseConnection): Promise<void> {
  await scratch.db.execute(sql`
    INSERT INTO token_forms (id, token_id, position, name, width, height, frame) VALUES
      (${ELF_FORM}, ${LYRA_ANCHOR}, 0, 'Elfa', 1, 1, 'round'),
      (${WOLF_FORM}, ${LYRA_ANCHOR}, 1, 'Loba', 2, 2, 'square'),
      (${STALE_FORM}, ${LYRA_SALAO}, 0, 'Velha', 1, 1, 'square')`);
  await scratch.db.execute(
    sql`UPDATE tokens SET active_form_id = ${WOLF_FORM} WHERE id = ${LYRA_ANCHOR}`,
  );
  await scratch.db.execute(
    sql`UPDATE tokens SET active_form_id = ${STALE_FORM} WHERE id = ${LYRA_SALAO}`,
  );
}

async function seedSheetsAndCards(scratch: DatabaseConnection, members: Members): Promise<void> {
  await scratch.db.execute(sql`
    INSERT INTO sheet_templates (id, campaign_id, name, html, css, js)
    VALUES (${TORMENTA}, ${VHARN}, 'Ficha Tormenta', '<p></p>', '', '')`);
  await scratch.db.execute(sql`
    INSERT INTO token_sheets (id, campaign_id, template_id, name, token_id, created_at) VALUES
      (${DIARY}, ${VHARN}, ${TORMENTA}, 'Diário', ${LYRA_ANCHOR}, '2026-02-01T00:00:00Z'),
      (${OLD_SHEET}, ${VHARN}, ${TORMENTA}, 'Ficha antiga', ${LYRA_ANCHOR}, '2026-01-01T00:00:00Z')`);
  await scratch.db.execute(sql`
    INSERT INTO member_cards (campaign_id, user_id, character_name, armor_class, difficulty_class, note_one, anchor_token_id) VALUES
      (${VHARN}, ${members.bia}, 'Lyra', 15, NULL, 'Arco longo', ${LYRA_ANCHOR}),
      (${VHARN}, ${members.duda}, 'Mira', NULL, 12, NULL, NULL),
      (${VHARN}, ${members.eli}, NULL, 11, NULL, NULL, NULL)`);
}

async function characterOf(scratch: DatabaseConnection, campaignId: string, userId: string) {
  const { rows } = await scratch.db.execute<Record<string, unknown>>(sql`
    SELECT * FROM characters WHERE campaign_id = ${campaignId} AND user_id = ${userId}`);
  return rows;
}

async function rowsOf(scratch: DatabaseConnection, query: ReturnType<typeof sql>) {
  const { rows } = await scratch.db.execute<Record<string, unknown>>(query);
  return rows;
}

// Raw SQL, not the DAO: the DAO reads the columns of every later migration.
describe('migration 0075_characters on a table with anchors and member cards', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;
  let beforeFolder: string;
  let charactersFolder: string;
  let members: Members;
  let lyraId: string;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH_DATABASE}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH_DATABASE));
    beforeFolder = await migrationsUpTo(LAST_MIGRATION_BEFORE);
    charactersFolder = await migrationsUpTo(CHARACTERS);
    await migrate(scratch.db, { migrationsFolder: beforeFolder });
    members = await seedMembers(scratch);
    await seedScenes(scratch, members.ana);
    await seedAnchors(scratch, members.bia);
    await seedForms(scratch);
    await seedSheetsAndCards(scratch, members);
    await migrate(scratch.db, { migrationsFolder: charactersFolder });
    const [lyra] = await characterOf(scratch, VHARN, members.bia);
    lyraId = String(lyra?.id);
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.close();
    await rm(beforeFolder, { recursive: true, force: true });
    await rm(charactersFolder, { recursive: true, force: true });
  });

  it("Bia's card and anchor become Lyra: the card's name and stats, the anchor's look", async () => {
    expect(await characterOf(scratch, VHARN, members.bia)).toEqual([
      expect.objectContaining({
        name: 'Lyra',
        initials: 'LY',
        side: 'ally',
        image_asset_id: PORTRAIT,
        frame: 'round',
        defeated: false,
        aura_kind: 'color',
        aura_radius: '2.00',
        aura_color: 'gold',
        aura_opacity: 60,
        width: 2,
        height: 2,
        armor_class: 15,
        difficulty_class: null,
        note_one: 'Arco longo',
        note_two: null,
      }),
    ]);
  });

  it("Lyra keeps the anchor's bars in their positions, its controller and its condition", async () => {
    const bars = await rowsOf(
      scratch,
      sql`
      SELECT position, label, current, max, color, visibility, display FROM character_bars
      WHERE character_id = ${lyraId} ORDER BY position`,
    );
    const controllers = await rowsOf(
      scratch,
      sql`
      SELECT user_id FROM character_controllers WHERE character_id = ${lyraId}`,
    );
    const conditions = await rowsOf(
      scratch,
      sql`
      SELECT token_id, condition_id, remaining_rounds FROM active_conditions WHERE character_id = ${lyraId}`,
    );
    expect(bars).toEqual([
      {
        position: 0,
        label: 'PV',
        current: 25,
        max: 30,
        color: 'ember',
        visibility: 'controllers',
        display: 'number',
      },
      {
        position: 1,
        label: 'Mana',
        current: 4,
        max: 10,
        color: 'steel',
        visibility: 'everyone',
        display: 'percent',
      },
    ]);
    expect(controllers).toEqual([{ user_id: members.bia }]);
    expect(conditions).toEqual([{ token_id: null, condition_id: POISONED, remaining_rounds: 3 }]);
  });

  it("Lyra's tokens in both grids point at her", async () => {
    const tokens = await rowsOf(
      scratch,
      sql`
      SELECT id, character_id FROM tokens WHERE id IN (${LYRA_SALAO}, ${LYRA_ESTRADA}) ORDER BY id`,
    );
    expect(tokens).toEqual([
      { id: LYRA_SALAO, character_id: lyraId },
      { id: LYRA_ESTRADA, character_id: lyraId },
    ]);
  });

  it("the anchor's sheets move to Lyra and the oldest becomes her main sheet", async () => {
    const sheets = await rowsOf(
      scratch,
      sql`
      SELECT id, token_id, character_id FROM token_sheets ORDER BY created_at`,
    );
    const [lyra] = await characterOf(scratch, VHARN, members.bia);
    expect(sheets).toEqual([
      { id: OLD_SHEET, token_id: null, character_id: lyraId },
      { id: DIARY, token_id: null, character_id: lyraId },
    ]);
    expect(lyra?.main_sheet_id).toBe(OLD_SHEET);
  });

  it("each linked token gets its own copy of the anchor's forms, showing the copied wolf", async () => {
    const forms = await rowsOf(
      scratch,
      sql`
      SELECT t.id AS token_id, f.name, f.position, f.id IN (${ELF_FORM}, ${WOLF_FORM}) AS anchors_own,
        t.active_form_id = f.id AS shown
      FROM tokens t JOIN token_forms f ON f.token_id = t.id
      WHERE t.id IN (${LYRA_SALAO}, ${LYRA_ESTRADA}) ORDER BY t.id, f.position`,
    );
    expect(forms).toEqual([
      { token_id: LYRA_SALAO, name: 'Elfa', position: 0, anchors_own: false, shown: false },
      { token_id: LYRA_SALAO, name: 'Loba', position: 1, anchors_own: false, shown: true },
      { token_id: LYRA_ESTRADA, name: 'Elfa', position: 0, anchors_own: false, shown: false },
      { token_id: LYRA_ESTRADA, name: 'Loba', position: 1, anchors_own: false, shown: true },
    ]);
  });

  it('Caio, a player with nothing, gets one with his nickname, its initials, an ally, no bars', async () => {
    const [caio] = await characterOf(scratch, VHARN, members.caio);
    const bars = await rowsOf(
      scratch,
      sql`SELECT id FROM character_bars WHERE character_id = ${caio?.id}`,
    );
    const controllers = await rowsOf(
      scratch,
      sql`
      SELECT user_id FROM character_controllers WHERE character_id = ${caio?.id}`,
    );
    expect(caio).toEqual(
      expect.objectContaining({
        name: 'Caio do Vale',
        initials: 'CV',
        side: 'ally',
        width: 1,
        height: 1,
        armor_class: null,
        main_sheet_id: null,
      }),
    );
    expect(bars).toEqual([]);
    expect(controllers).toEqual([{ user_id: members.caio }]);
  });

  it("Duda, a spectator with a stored card, keeps a stored character with the card's fields", async () => {
    expect(await characterOf(scratch, VHARN, members.duda)).toEqual([
      expect.objectContaining({
        name: 'Mira',
        initials: 'MI',
        difficulty_class: 12,
        armor_class: null,
      }),
    ]);
  });

  it('a card with only the CA and no anchor gives a character with the nickname and that CA', async () => {
    expect(await characterOf(scratch, VHARN, members.eli)).toEqual([
      expect.objectContaining({ name: 'Eli', initials: 'EL', armor_class: 11 }),
    ]);
  });

  it('Ana, the master without a card, gets no character', async () => {
    expect(await characterOf(scratch, VHARN, members.ana)).toEqual([]);
  });

  it('the anchor of a player who left becomes a character without a player, its token linked', async () => {
    const gorm = await rowsOf(
      scratch,
      sql`
      SELECT c.name, c.side, c.user_id, t.id AS token_id FROM characters c
      JOIN tokens t ON t.character_id = c.id WHERE c.campaign_id = ${VHARN} AND c.name = 'Gorm'`,
    );
    expect(gorm).toEqual([{ name: 'Gorm', side: 'neutral', user_id: null, token_id: GORM_SALAO }]);
  });

  it("the Quelm gets only Bia's own character there, with nothing of the Vharn", async () => {
    const quelm = await rowsOf(
      scratch,
      sql`
      SELECT c.name, c.user_id, c.armor_class, c.main_sheet_id,
        (SELECT count(*)::int FROM character_bars b WHERE b.character_id = c.id) AS bars,
        (SELECT count(*)::int FROM active_conditions a WHERE a.character_id = c.id) AS conditions
      FROM characters c WHERE c.campaign_id = ${QUELM}`,
    );
    const vharn = await rowsOf(
      scratch,
      sql`
      SELECT name FROM characters WHERE campaign_id = ${VHARN} ORDER BY name`,
    );
    expect(quelm).toEqual([
      {
        name: 'Bia',
        user_id: members.bia,
        armor_class: null,
        main_sheet_id: null,
        bars: 0,
        conditions: 0,
      },
    ]);
    expect(vharn).toEqual([
      { name: 'Caio do Vale' },
      { name: 'Eli' },
      { name: 'Gorm' },
      { name: 'Lyra' },
      { name: 'Mira' },
    ]);
  });

  it('every table starts its characters version at 0', async () => {
    const versions = await rowsOf(
      scratch,
      sql`SELECT characters_version FROM campaigns ORDER BY name`,
    );
    expect(versions).toEqual([{ characters_version: 0 }, { characters_version: 0 }]);
  });

  it('a second character of Bia in the Vharn is refused by the unique index', async () => {
    const insert = scratch.db.execute(sql`
      INSERT INTO characters (campaign_id, user_id, name, initials, side) VALUES (${VHARN}, ${members.bia}, 'Outra', 'OU', 'ally')`);
    await expect(insert).rejects.toMatchObject({
      cause: expect.objectContaining({ constraint: 'characters_campaign_user_unique' }),
    });
  });

  it('a sheet held by a token and a character at once is refused', async () => {
    const update = scratch.db.execute(
      sql`UPDATE token_sheets SET token_id = ${LYRA_SALAO} WHERE id = ${DIARY}`,
    );
    await expect(update).rejects.toMatchObject({
      cause: expect.objectContaining({ constraint: 'token_sheets_one_holder' }),
    });
  });

  it.each([
    ['both a token and a character', LYRA_SALAO, true],
    ['neither a token nor a character', null, false],
  ])('a condition held by %s is refused', async (_holders, tokenId, onLyra) => {
    const insert = scratch.db.execute(sql`
      INSERT INTO active_conditions (token_id, character_id, condition_id)
      VALUES (${tokenId}::uuid, ${onLyra ? lyraId : null}::uuid, ${POISONED})`);
    await expect(insert).rejects.toMatchObject({
      cause: expect.objectContaining({ constraint: 'active_conditions_one_holder' }),
    });
  });

  it('a character name of 61 characters is refused', async () => {
    const insert = scratch.db.execute(sql`
      INSERT INTO characters (campaign_id, name, initials, side) VALUES (${VHARN}, ${'a'.repeat(61)}, 'AA', 'ally')`);
    await expect(insert).rejects.toMatchObject({
      cause: expect.objectContaining({ constraint: 'characters_name_length' }),
    });
  });
});
