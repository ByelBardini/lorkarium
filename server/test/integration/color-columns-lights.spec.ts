import { sql, type SQL } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readEnv } from '../../src/config/env';
import {
  createDatabase,
  type Database,
  type DatabaseConnection,
} from '../../src/database/database';
import { runMigrations, runMigrationsThrough } from '../../src/database/migrate';
import { databaseUrlNamed, insertUserAtOldMigration } from '../support/migrations-up-to';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const CHECK_VIOLATION = '23514';
const SCRATCH = 'lorkarium_light_colors_text';
const LAST_MIGRATION_WITH_THE_ENUM = '0087_cover_tone_text';
const VHARN = '10000000-0000-4000-8000-000000000001';
const SALAO = '20000000-0000-4000-8000-000000000001';

type ColorColumn = Readonly<{ table: string; column: string; insert: (color: string) => SQL }>;

function lightWith(color: string): SQL {
  return sql`
    INSERT INTO lights (scene_id, x, y, bright, dim, color)
    VALUES (${SALAO}, 1, 1, 4, 4, ${color})`;
}

function tokenLightWith(color: string): SQL {
  return sql`
    INSERT INTO tokens (scene_id, name, initials, side, width, height, col, row,
      light_bright, light_dim, light_color)
    VALUES (${SALAO}, 'Lyra', 'LY', 'ally', 1, 1, 0, 0, 4, 4, ${color})`;
}

const COLOR_COLUMNS: readonly ColorColumn[] = [
  { table: 'lights', column: 'color', insert: lightWith },
  { table: 'tokens', column: 'light_color', insert: tokenLightWith },
];

async function seedVharn(db: Database): Promise<void> {
  const ana = await insertUserAtOldMigration(db, { name: 'Ana', email: 'ana@mesa.com' });
  await db.execute(sql`
    INSERT INTO campaigns (id, owner_id, name, join_code) VALUES (${VHARN}, ${ana}, 'Vharn', 'VHRN7K2Q')`);
  await db.execute(sql`INSERT INTO scenes (id, campaign_id) VALUES (${SALAO}, ${VHARN})`);
}

async function colorsOf(db: Database, { table, column }: ColorColumn): Promise<unknown[]> {
  const { rows } = await db.execute<Record<string, unknown>>(
    sql`SELECT ${sql.identifier(column)} AS color FROM ${sql.identifier(table)}`,
  );
  return rows.map((row) => row['color']);
}

const LABELED_COLUMNS = COLOR_COLUMNS.map((column) => ({
  label: `${column.table}.${column.column}`,
  target: column,
}));

describe.each(LABELED_COLUMNS)('the color column $label', ({ target }) => {
  let connection: DatabaseConnection;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    await seedVharn(connection.db);
  });

  afterAll(() => connection.close());

  it.each(['infernal', '#336699'])('%s is saved as it came', async (color) => {
    await connection.db.execute(target.insert(color));

    expect(await colorsOf(connection.db, target)).toEqual([color]);
  });

  it.each(['red', '#FFF', '#FFAA00', '#336699;x', 'url(x)'])(
    '%s violates the CHECK',
    async (color) => {
      await expect(connection.db.execute(target.insert(color))).rejects.toMatchObject({
        cause: { code: CHECK_VIOLATION },
      });
    },
  );
});

describe('migration light_colors_text: the enum columns become text', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;

  async function seedEnumRows(db: Database): Promise<void> {
    await seedVharn(db);
    await db.execute(lightWith('necrotic'));
    await db.execute(sql`
      INSERT INTO lights (scene_id, x, y, bright, dim) VALUES (${SALAO}, 2, 2, 4, 4)`);
    await db.execute(tokenLightWith('moon'));
  }

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH));
    await runMigrationsThrough(scratch.db, LAST_MIGRATION_WITH_THE_ENUM);
    await seedEnumRows(scratch.db);
    await runMigrations(scratch.db);
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH}`));
    await admin.close();
  });

  it.each([
    ['lights', 'color', ['necrotic', null]],
    ['tokens', 'light_color', ['moon']],
  ])('%s.%s keeps its values', async (table, column, expected) => {
    const target = { table, column, insert: lightWith };

    expect(await colorsOf(scratch.db, target)).toEqual(expected);
  });

  it('the columns are text and the enum type is gone', async () => {
    const { rows: columns } = await scratch.db.execute<{ udt_name: string }>(sql`
      SELECT DISTINCT udt_name FROM information_schema.columns
      WHERE (table_name, column_name) IN (('lights', 'color'), ('tokens', 'light_color'))`);
    const { rows: types } = await scratch.db.execute(
      sql`SELECT 1 FROM pg_type WHERE typname = 'light_color'`,
    );

    expect(columns).toEqual([{ udt_name: 'text' }]);
    expect(types).toEqual([]);
  });
});
