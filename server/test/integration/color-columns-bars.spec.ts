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
const SCRATCH = 'lorkarium_bar_colors_text';
const LAST_MIGRATION_WITH_THE_ENUM = '0084_drawing_colors_text';
const VHARN = '10000000-0000-4000-8000-000000000011';
const SALAO = '20000000-0000-4000-8000-000000000011';
const LYRA = '30000000-0000-4000-8000-000000000011';
const BRAN = '40000000-0000-4000-8000-000000000011';

type BarTable = Readonly<{ table: string; insert: (color: string, position?: number) => SQL }>;

function tokenBarWith(color: string, position = 0): SQL {
  return sql`
    INSERT INTO token_bars (token_id, position, label, current, max, color, visibility)
    VALUES (${LYRA}, ${position}, 'PV', 1, 2, ${color}, 'everyone')`;
}

function characterBarWith(color: string, position = 0): SQL {
  return sql`
    INSERT INTO character_bars (character_id, position, label, current, max, color, visibility)
    VALUES (${BRAN}, ${position}, 'PV', 1, 2, ${color}, 'everyone')`;
}

const BAR_TABLES: readonly BarTable[] = [
  { table: 'token_bars', insert: tokenBarWith },
  { table: 'character_bars', insert: characterBarWith },
];

async function seedOwners(db: Database): Promise<void> {
  const ana = await insertUserAtOldMigration(db, { name: 'Ana', email: 'ana@mesa.com' });
  await db.execute(sql`
    INSERT INTO campaigns (id, owner_id, name, join_code) VALUES (${VHARN}, ${ana}, 'Vharn', 'VHRN7K2Q')`);
  await db.execute(sql`INSERT INTO scenes (id, campaign_id) VALUES (${SALAO}, ${VHARN})`);
  await db.execute(sql`
    INSERT INTO tokens (id, scene_id, name, initials, side, width, height, col, row)
    VALUES (${LYRA}, ${SALAO}, 'Lyra', 'LY', 'ally', 1, 1, 0, 0)`);
  await db.execute(sql`
    INSERT INTO characters (id, campaign_id, name, initials, side)
    VALUES (${BRAN}, ${VHARN}, 'Bran', 'BR', 'ally')`);
}

async function colorsOf(db: Database, table: string): Promise<unknown[]> {
  const { rows } = await db.execute<Record<string, unknown>>(
    sql`SELECT color FROM ${sql.identifier(table)} ORDER BY position`,
  );
  return rows.map((row) => row['color']);
}

describe.each(BAR_TABLES)('the color of $table', ({ table, insert }) => {
  let connection: DatabaseConnection;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    await seedOwners(connection.db);
  });

  afterAll(() => connection.close());

  it.each(['gold', 'ash', '#336699'])('%s is saved as it came', async (color) => {
    await connection.db.execute(insert(color));

    expect(await colorsOf(connection.db, table)).toEqual([color]);
  });

  // 'violet' is on the drawing palette, not on the five of the bars.
  it.each(['red', 'violet', '#FFF', '#FFAA00', '#336699;x', 'url(x)'])(
    '%s violates the CHECK',
    async (color) => {
      await expect(connection.db.execute(insert(color))).rejects.toMatchObject({
        cause: { code: CHECK_VIOLATION },
      });
    },
  );
});

describe('migration bar_colors_text: the enum column becomes text', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH));
    await runMigrationsThrough(scratch.db, LAST_MIGRATION_WITH_THE_ENUM);
    await seedOwners(scratch.db);
    await scratch.db.execute(tokenBarWith('ember', 0));
    await scratch.db.execute(tokenBarWith('moss', 1));
    await scratch.db.execute(characterBarWith('steel'));
    await runMigrations(scratch.db);
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH}`));
    await admin.close();
  });

  it.each([
    ['token_bars', ['ember', 'moss']],
    ['character_bars', ['steel']],
  ])('%s keeps its values', async (table, expected) => {
    expect(await colorsOf(scratch.db, table)).toEqual(expected);
  });

  it('the columns are text and the enum type is gone', async () => {
    const { rows: columns } = await scratch.db.execute<{ udt_name: string }>(sql`
      SELECT DISTINCT udt_name FROM information_schema.columns
      WHERE column_name = 'color' AND table_name IN ('token_bars', 'character_bars')`);
    const { rows: types } = await scratch.db.execute(
      sql`SELECT 1 FROM pg_type WHERE typname = 'bar_color'`,
    );

    expect(columns).toEqual([{ udt_name: 'text' }]);
    expect(types).toEqual([]);
  });
});
