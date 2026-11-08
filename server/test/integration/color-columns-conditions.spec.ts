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
const SCRATCH = 'lorkarium_condition_colors_check';
const LAST_MIGRATION_WITHOUT_THE_CHECK = '0085_bar_colors_text';
const VHARN = '10000000-0000-4000-8000-000000000001';

function definitionWith(name: string, color: string | null): SQL {
  return sql`
    INSERT INTO condition_definitions (campaign_id, name, tone, color)
    VALUES (${VHARN}, ${name}, 'harm', ${color})`;
}

async function seedVharn(db: Database): Promise<void> {
  const ana = await insertUserAtOldMigration(db, { name: 'Ana', email: 'ana@mesa.com' });
  await db.execute(sql`
    INSERT INTO campaigns (id, owner_id, name, join_code) VALUES (${VHARN}, ${ana}, 'Vharn', 'VHRN7K2Q')`);
}

async function colorsOf(db: Database): Promise<unknown[]> {
  const { rows } = await db.execute<{ color: unknown }>(
    sql`SELECT color FROM condition_definitions ORDER BY name`,
  );
  return rows.map((row) => row.color);
}

describe('the column condition_definitions.color', () => {
  let connection: DatabaseConnection;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    await seedVharn(connection.db);
  });

  afterAll(() => connection.close());

  it.each(['gold', 'bone', '#336699', null])('%s is saved as it came', async (color) => {
    await connection.db.execute(definitionWith('Marcado', color));

    expect(await colorsOf(connection.db)).toEqual([color]);
  });

  it.each(['red', '', '#FFF', '#FFAA00', '#336699;x', 'url(x)', 'steel'])(
    '"%s" violates the CHECK',
    async (color) => {
      await expect(connection.db.execute(definitionWith('Marcado', color))).rejects.toMatchObject({
        cause: { code: CHECK_VIOLATION },
      });
    },
  );
});

describe('migration condition_colors_check', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;

  async function seedOldRows(db: Database): Promise<void> {
    await seedVharn(db);
    await db.execute(definitionWith('Agarrado', 'ember'));
    await db.execute(definitionWith('Banido', 'bone'));
    await db.execute(definitionWith('Cego', null));
  }

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH));
    await runMigrationsThrough(scratch.db, LAST_MIGRATION_WITHOUT_THE_CHECK);
    await seedOldRows(scratch.db);
    await runMigrations(scratch.db);
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH}`));
    await admin.close();
  });

  it('the colors already saved stay as they were', async () => {
    expect(await colorsOf(scratch.db)).toEqual(['ember', 'bone', null]);
  });

  it('the migrated database refuses a color outside the rule', async () => {
    await expect(scratch.db.execute(definitionWith('Doente', 'red'))).rejects.toMatchObject({
      cause: { code: CHECK_VIOLATION },
    });
  });
});
