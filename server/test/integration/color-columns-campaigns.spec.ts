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
const SCRATCH = 'lorkarium_cover_tone_text';
const LAST_MIGRATION_WITH_THE_SMALLINT = '0086_condition_colors_check';

function campaignWithTone(owner: string, name: string, tone: number | string | null): SQL {
  return sql`
    INSERT INTO campaigns (owner_id, name, join_code, cover_drawing, cover_tone)
    VALUES (${owner}, ${name}, ${`CODE${name}`}, 0, ${tone})`;
}

async function tonesOf(db: Database): Promise<unknown[]> {
  const { rows } = await db.execute<{ cover_tone: unknown }>(
    sql`SELECT cover_tone FROM campaigns ORDER BY name`,
  );
  return rows.map((row) => row.cover_tone);
}

function seedAna(db: Database): Promise<string> {
  return insertUserAtOldMigration(db, { name: 'Ana', email: 'ana@mesa.com' });
}

describe('the column campaigns.cover_tone', () => {
  let connection: DatabaseConnection;
  let ana: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    ana = await seedAna(connection.db);
  });

  afterAll(() => connection.close());

  it.each(['1', '4', '#336699'])('%s is saved as it came', async (tone) => {
    await connection.db.execute(campaignWithTone(ana, 'Vharn', tone));

    expect(await tonesOf(connection.db)).toEqual([tone]);
  });

  it('a campaign that never chose keeps it null', async () => {
    await connection.db.execute(campaignWithTone(ana, 'Vharn', null));

    expect(await tonesOf(connection.db)).toEqual([null]);
  });

  it.each(['0', '5', '9', '12', 'gold', '#FFF', '#ABCDEF', '#336699;x', 'url(x)', ''])(
    '"%s" violates the CHECK',
    async (tone) => {
      await expect(
        connection.db.execute(campaignWithTone(ana, 'Vharn', tone)),
      ).rejects.toMatchObject({ cause: { code: CHECK_VIOLATION } });
    },
  );
});

describe('migration cover_tone_text: the smallint column becomes text', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;

  async function seedSmallintRows(db: Database): Promise<void> {
    const ana = await seedAna(db);
    await db.execute(campaignWithTone(ana, 'A', 1));
    await db.execute(campaignWithTone(ana, 'B', 2));
    await db.execute(campaignWithTone(ana, 'C', 3));
    await db.execute(campaignWithTone(ana, 'D', 4));
    await db.execute(campaignWithTone(ana, 'E', null));
  }

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH));
    await runMigrationsThrough(scratch.db, LAST_MIGRATION_WITH_THE_SMALLINT);
    await seedSmallintRows(scratch.db);
    await runMigrations(scratch.db);
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH}`));
    await admin.close();
  });

  it('every tone comes through as its digit, and the null stays null', async () => {
    expect(await tonesOf(scratch.db)).toEqual(['1', '2', '3', '4', null]);
  });

  it('the column is text', async () => {
    const { rows } = await scratch.db.execute<{ udt_name: string }>(sql`
      SELECT udt_name FROM information_schema.columns
      WHERE table_name = 'campaigns' AND column_name = 'cover_tone'`);

    expect(rows).toEqual([{ udt_name: 'text' }]);
  });
});
