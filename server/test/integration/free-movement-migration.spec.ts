import { sql, type SQL } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readEnv } from '../../src/config/env';
import {
  createDatabase,
  type Database,
  type DatabaseConnection,
} from '../../src/database/database';
import { runMigrations, runMigrationsThrough } from '../../src/database/migrate';
import { databaseUrlNamed, insertUserAtOldMigration } from '../support/migrations-up-to';

const CHECK_VIOLATION = '23514';
const SCRATCH = 'lorkarium_free_movement';
const LAST_MIGRATION_WITH_HALF_CELLS = '0093_scene_folder_visibility';
const VHARN = '10000000-0000-4000-8000-000000000001';
const SALAO = '20000000-0000-4000-8000-000000000001';
const LYRA = '30000000-0000-4000-8000-000000000001';

async function seedVharn(db: Database): Promise<void> {
  const ana = await insertUserAtOldMigration(db, { name: 'Ana', email: 'ana@mesa.com' });
  await db.execute(sql`
    INSERT INTO campaigns (id, owner_id, name, join_code) VALUES (${VHARN}, ${ana}, 'Vharn', 'VHRN7K2Q')`);
  await db.execute(sql`INSERT INTO scenes (id, campaign_id) VALUES (${SALAO}, ${VHARN})`);
  await db.execute(sql`
    INSERT INTO tokens (id, scene_id, name, initials, side, width, height, col, row)
    VALUES (${LYRA}, ${SALAO}, 'Lyra', 'LY', 'ally', 1.5, 1, 2.5, 4)`);
}

function setLyra(assignment: SQL): SQL {
  return sql`UPDATE tokens SET ${assignment} WHERE id = ${LYRA}`;
}

describe('migration free_movement: a scene that existed and the step of 1/64', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH));
    await runMigrationsThrough(scratch.db, LAST_MIGRATION_WITH_HALF_CELLS);
    await seedVharn(scratch.db);
    await runMigrations(scratch.db);
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH}`));
    await admin.close();
  });

  it('the scene that existed migrates with free_movement false', async () => {
    const { rows } = await scratch.db.execute(sql`SELECT free_movement FROM scenes`);

    expect(rows).toEqual([{ free_movement: false }]);
  });

  it('the token that existed keeps its half-cell box', async () => {
    const { rows } = await scratch.db.execute(sql`SELECT col, row, width, height FROM tokens`);

    expect(rows).toEqual([{ col: 2.5, row: 4, width: 1.5, height: 1 }]);
  });

  it('the old CHECK is gone and the new one is in its place', async () => {
    const { rows } = await scratch.db.execute(sql`
      SELECT conname FROM pg_constraint WHERE conname LIKE 'tokens_box_%' ORDER BY conname`);

    expect(rows).toEqual([{ conname: 'tokens_box_steps' }]);
  });

  it.each([
    ['col', sql`col = 3.015625`, 3.015625],
    ['row', sql`row = 7.984375`, 7.984375],
  ])('a %s in steps of 1/64 is saved', async (axis, assignment, expected) => {
    await scratch.db.execute(setLyra(assignment));

    const { rows } = await scratch.db.execute<Record<string, number>>(
      sql`SELECT ${sql.identifier(axis)} AS value FROM tokens`,
    );
    expect(rows).toEqual([{ value: expected }]);
  });

  it.each([
    ['col off the step', sql`col = 3.01`],
    ['row off the step', sql`row = 0.1`],
    ['negative col', sql`col = -0.015625`],
    ['width of 1/64', sql`width = 1.015625`],
    ['height of 1/64', sql`height = 1.015625`],
  ])('%s violates the CHECK', async (_case, assignment) => {
    await expect(scratch.db.execute(setLyra(assignment))).rejects.toMatchObject({
      cause: { code: CHECK_VIOLATION },
    });
  });
});
