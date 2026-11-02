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

const SCRATCH = 'lorkarium_character_forms';
const VHARN = '10000000-0000-4000-8000-000000000001';
const SALAO = '20000000-0000-4000-8000-000000000001';
const ESTRADA = '20000000-0000-4000-8000-000000000002';
const LYRA = '40000000-0000-4000-8000-000000000001';
const CROWDED = '40000000-0000-4000-8000-000000000002';
const LYRA_SALAO = '30000000-0000-4000-8000-000000000001';
const LYRA_ESTRADA = '30000000-0000-4000-8000-000000000002';
const GOBLIN = '30000000-0000-4000-8000-000000000003';
const CROWDED_SALAO = '30000000-0000-4000-8000-000000000004';
const WOLF_SALAO = '50000000-0000-4000-8000-000000000001';
const WOLF_ESTRADA = '50000000-0000-4000-8000-000000000002';
const NINTH = '50000000-0000-4000-8000-000000000003';
const GOBLIN_FORM = '50000000-0000-4000-8000-000000000004';

type Row = Record<string, unknown>;

async function rowsOf(scratch: DatabaseConnection, query: ReturnType<typeof sql>): Promise<Row[]> {
  return (await scratch.db.execute<Row>(query)).rows;
}

async function seedTable(scratch: DatabaseConnection): Promise<void> {
  const ana = await insertUserAtOldMigration(scratch.db, { name: 'Ana', email: 'ana@mesa.com' });
  await scratch.db.execute(sql`
    INSERT INTO campaigns (id, owner_id, name, join_code) VALUES (${VHARN}, ${ana}, 'Vharn', 'VHRN7K2Q')`);
  await scratch.db.execute(sql`
    INSERT INTO scenes (id, campaign_id) VALUES (${SALAO}, ${VHARN}), (${ESTRADA}, ${VHARN})`);
  await scratch.db.execute(sql`
    INSERT INTO characters (id, campaign_id, name, initials, side) VALUES
      (${LYRA}, ${VHARN}, 'Lyra', 'LY', 'ally'), (${CROWDED}, ${VHARN}, 'Cheia', 'CH', 'ally')`);
  await scratch.db.execute(sql`
    INSERT INTO tokens (id, scene_id, name, initials, side, width, height, col, row, character_id, created_at) VALUES
      (${LYRA_SALAO}, ${SALAO}, 'Lyra', 'LY', 'ally', 1, 1, 0, 0, ${LYRA}, '2026-01-01'),
      (${LYRA_ESTRADA}, ${ESTRADA}, 'Lyra', 'LY', 'ally', 1, 1, 0, 0, ${LYRA}, '2026-01-02'),
      (${GOBLIN}, ${SALAO}, 'Goblin', 'GO', 'enemy', 1, 1, 2, 2, NULL, '2026-01-03'),
      (${CROWDED_SALAO}, ${SALAO}, 'Cheia', 'CH', 'ally', 1, 1, 3, 3, ${CROWDED}, '2026-01-04')`);
}

async function seedForms(scratch: DatabaseConnection): Promise<void> {
  await scratch.db.execute(sql`
    INSERT INTO token_forms (id, token_id, position, name, width, height) VALUES
      (gen_random_uuid(), ${LYRA_SALAO}, 0, 'Elfa', 1, 1),
      (${WOLF_SALAO}, ${LYRA_SALAO}, 1, 'Lobo', 2, 2),
      (gen_random_uuid(), ${LYRA_ESTRADA}, 0, 'Elfa', 1, 1),
      (${WOLF_ESTRADA}, ${LYRA_ESTRADA}, 1, 'Lobo', 2, 2),
      (gen_random_uuid(), ${LYRA_ESTRADA}, 2, 'Corvo', 0.5, 0.5),
      (${GOBLIN_FORM}, ${GOBLIN}, 0, 'Chefe', 2, 2),
      (${NINTH}, ${CROWDED_SALAO}, 8, 'Nona', 1, 1)`);
  await scratch.db.execute(sql`
    INSERT INTO token_forms (token_id, position, name, width, height)
    SELECT ${CROWDED_SALAO}::uuid, n, 'Forma ' || n, 1, 1 FROM generate_series(0, 7) AS n`);
  await scratch.db.execute(sql`
    UPDATE tokens SET active_form_id = CASE id
      WHEN ${LYRA_ESTRADA}::uuid THEN ${WOLF_ESTRADA}::uuid
      WHEN ${GOBLIN}::uuid THEN ${GOBLIN_FORM}::uuid
      WHEN ${CROWDED_SALAO}::uuid THEN ${NINTH}::uuid
    END
    WHERE id IN (${LYRA_ESTRADA}, ${GOBLIN}, ${CROWDED_SALAO})`);
}

describe('migration 0079: the forms of a linked token move to its character', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;
  const folders: string[] = [];

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH));
    folders.push(
      await migrationsUpTo('0078_bar_temp'),
      await migrationsUpTo('0079_character_forms'),
    );
    await migrate(scratch.db, { migrationsFolder: folders[0] ?? '' });
    await seedTable(scratch);
    await seedForms(scratch);
    await migrate(scratch.db, { migrationsFolder: folders[1] ?? '' });
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH}`));
    await admin.close();
    for (const folder of folders) await rm(folder, { recursive: true, force: true });
  });

  it("the same form on two grids becomes one, the first token's order first", async () => {
    const forms = await rowsOf(
      scratch,
      sql`SELECT position, name FROM token_forms WHERE character_id = ${LYRA} ORDER BY position`,
    );
    expect(forms).toEqual([
      { position: 0, name: 'Elfa' },
      { position: 1, name: 'Lobo' },
      { position: 2, name: 'Corvo' },
    ]);
  });

  it('no linked token keeps a form of its own', async () => {
    const own = await rowsOf(
      scratch,
      sql`SELECT f.id FROM token_forms f JOIN tokens t ON t.id = f.token_id WHERE t.character_id IS NOT NULL`,
    );
    expect(own).toEqual([]);
  });

  it('each token keeps showing what it showed, now the form of its character', async () => {
    const [shown] = await rowsOf(
      scratch,
      sql`SELECT f.name, f.character_id FROM tokens t JOIN token_forms f ON f.id = t.active_form_id WHERE t.id = ${LYRA_ESTRADA}`,
    );
    expect(shown).toEqual({ name: 'Lobo', character_id: LYRA });
    const [none] = await rowsOf(
      scratch,
      sql`SELECT active_form_id FROM tokens WHERE id = ${LYRA_SALAO}`,
    );
    expect(none).toEqual({ active_form_id: null });
  });

  it('a character keeps 8 at most, and a token showing one left out shows none', async () => {
    const forms = await rowsOf(
      scratch,
      sql`SELECT position, name FROM token_forms WHERE character_id = ${CROWDED} ORDER BY position`,
    );
    expect(forms.map(({ name }) => name)).toEqual(
      [0, 1, 2, 3, 4, 5, 6, 7].map((n) => `Forma ${n}`),
    );
    expect(forms.map(({ position }) => position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const [left] = await rowsOf(
      scratch,
      sql`SELECT active_form_id FROM tokens WHERE id = ${CROWDED_SALAO}`,
    );
    expect(left).toEqual({ active_form_id: null });
  });

  it('a free token keeps its forms and the one it shows', async () => {
    const [goblin] = await rowsOf(
      scratch,
      sql`SELECT t.active_form_id, f.token_id, f.character_id FROM tokens t JOIN token_forms f ON f.id = t.active_form_id WHERE t.id = ${GOBLIN}`,
    );
    expect(goblin).toEqual({ active_form_id: GOBLIN_FORM, token_id: GOBLIN, character_id: null });
  });

  it('a form with no holder, or with both, is refused', async () => {
    const insert = (tokenId: string | null, characterId: string | null) =>
      scratch.db.execute(sql`
        INSERT INTO token_forms (token_id, character_id, position, name, width, height)
        VALUES (${tokenId}, ${characterId}, 50, 'Sem dono', 1, 1)`);
    await expect(insert(null, null)).rejects.toThrow();
    await expect(insert(GOBLIN, LYRA)).rejects.toThrow();
  });
});
