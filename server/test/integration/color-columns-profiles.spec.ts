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
const SCRATCH = 'lorkarium_member_colors_text';
const LAST_MIGRATION_WITH_THE_ENUM = '0088_light_colors_text';

function setColorOf(userId: string, color: string): SQL {
  return sql`UPDATE users SET color = ${color} WHERE id = ${userId}`;
}

function setEnumColorOf(userId: string, color: string): SQL {
  return sql`UPDATE users SET color = ${color}::member_color WHERE id = ${userId}`;
}

async function colorOf(db: Database, userId: string): Promise<unknown> {
  const { rows } = await db.execute<{ color: unknown }>(
    sql`SELECT color FROM users WHERE id = ${userId}`,
  );
  return rows[0]?.color;
}

describe('the column users.color', () => {
  let connection: DatabaseConnection;
  let anaId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    anaId = await insertUserAtOldMigration(connection.db, { name: 'Ana', email: 'ana@mesa.com' });
  });

  afterAll(() => connection.close());

  it.each(['rose', '#336699'])('%s is saved as it came', async (color) => {
    await connection.db.execute(setColorOf(anaId, color));

    expect(await colorOf(connection.db, anaId)).toBe(color);
  });

  it('an account that never chose keeps NULL', async () => {
    expect(await colorOf(connection.db, anaId)).toBeNull();
  });

  it.each(['red', '#FFF', '#FFAA00', '#336699;x', 'url(x)'])(
    '%s violates the CHECK',
    async (color) => {
      await expect(connection.db.execute(setColorOf(anaId, color))).rejects.toMatchObject({
        cause: { code: CHECK_VIOLATION, constraint: 'users_color_value' },
      });
    },
  );
});

describe('migration member_colors_text: the enum column becomes text', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;
  let anaId: string;
  let biaId: string;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH));
    await runMigrationsThrough(scratch.db, LAST_MIGRATION_WITH_THE_ENUM);
    anaId = await insertUserAtOldMigration(scratch.db, { name: 'Ana', email: 'ana@mesa.com' });
    biaId = await insertUserAtOldMigration(scratch.db, { name: 'Bia', email: 'bia@mesa.com' });
    await scratch.db.execute(setEnumColorOf(anaId, 'violet'));
    await runMigrations(scratch.db);
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH}`));
    await admin.close();
  });

  it('a chosen color keeps its name', async () => {
    expect(await colorOf(scratch.db, anaId)).toBe('violet');
  });

  it('an account that never chose stays NULL', async () => {
    expect(await colorOf(scratch.db, biaId)).toBeNull();
  });

  it('the column is text and the enum type is gone', async () => {
    const { rows: columns } = await scratch.db.execute<{ udt_name: string }>(sql`
      SELECT udt_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'color'`);
    const { rows: types } = await scratch.db.execute(
      sql`SELECT 1 FROM pg_type WHERE typname = 'member_color'`,
    );

    expect(columns).toEqual([{ udt_name: 'text' }]);
    expect(types).toEqual([]);
  });
});
