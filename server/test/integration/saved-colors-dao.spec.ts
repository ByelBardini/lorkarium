import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { runInTransaction } from '../../src/database/transaction';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { users } from '../../src/modules/auth/users.po';
import { SavedColorsDao } from '../../src/modules/saved-colors/saved-colors.dao';
import { newUserPo } from '../support/auth-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

describe('SavedColorsDao on Postgres', () => {
  let connection: DatabaseConnection;
  let colors: SavedColorsDao;
  let biaId: string;
  let caioId: string;

  async function colorsOf(userId: string): Promise<string[]> {
    return (await colors.listOf(userId)).map((row) => row.color);
  }

  beforeAll(async () => {
    connection = await openTestDatabase();
    colors = new SavedColorsDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const accounts = new UsersDao(connection.db);
    biaId = (await accounts.insert(newUserPo({ email: 'bia@mesa.com', name: 'Bia' }))).id;
    caioId = (await accounts.insert(newUserPo({ email: 'caio@mesa.com', name: 'Caio' }))).id;
  });

  afterAll(() => connection.close());

  it('two colors of Bia come back with the most recent first', async () => {
    await colors.insertIfAbsent(biaId, '#aabbcc');
    await colors.insertIfAbsent(biaId, '#336699');

    expect(await colorsOf(biaId)).toEqual(['#336699', '#aabbcc']);
  });

  it('insertIfAbsent returns the row it kept', async () => {
    const row = await colors.insertIfAbsent(biaId, '#aabbcc');

    expect(row).toEqual({ userId: biaId, color: '#aabbcc', createdAt: expect.any(Date) });
  });

  it('saving the same color twice keeps one row and answers undefined the second time', async () => {
    await colors.insertIfAbsent(biaId, '#aabbcc');

    expect(await colors.insertIfAbsent(biaId, '#aabbcc')).toBeUndefined();
    expect(await colorsOf(biaId)).toEqual(['#aabbcc']);
  });

  it('remove takes only the color asked for', async () => {
    await colors.insertIfAbsent(biaId, '#aabbcc');
    await colors.insertIfAbsent(biaId, '#336699');

    await colors.remove(biaId, '#aabbcc');

    expect(await colorsOf(biaId)).toEqual(['#336699']);
  });

  it('removing a color the account does not keep does not fail', async () => {
    await expect(colors.remove(biaId, '#aabbcc')).resolves.toBeUndefined();
  });

  it('deleting the account takes its list along', async () => {
    await colors.insertIfAbsent(biaId, '#aabbcc');

    await connection.db.delete(users).where(eq(users.id, biaId));

    const left = await connection.db.execute(sql`SELECT 1 FROM account_saved_colors`);
    expect(left.rows).toEqual([]);
  });

  it.each(['#FFF', '#FFAA00', 'gold', 'url(x)'])(
    'the check of the table refuses %j written straight to the database',
    async (color) => {
      const insert = sql`INSERT INTO account_saved_colors (user_id, color) VALUES (${biaId}, ${color})`;

      await expect(connection.db.execute(insert)).rejects.toMatchObject({
        cause: { code: '23514', constraint: 'account_saved_colors_color_hex' },
      });
    },
  );

  it('Bia does not list the colors of Caio', async () => {
    await colors.insertIfAbsent(caioId, '#aabbcc');

    expect(await colorsOf(biaId)).toEqual([]);
  });

  it('both can keep the same color, each with their own copy', async () => {
    await colors.insertIfAbsent(caioId, '#aabbcc');
    await colors.insertIfAbsent(biaId, '#aabbcc');

    expect(await colorsOf(biaId)).toEqual(['#aabbcc']);
    expect(await colorsOf(caioId)).toEqual(['#aabbcc']);
  });

  it('remove of Bia does not touch the same color of Caio', async () => {
    await colors.insertIfAbsent(caioId, '#aabbcc');

    await colors.remove(biaId, '#aabbcc');

    expect(await colorsOf(caioId)).toEqual(['#aabbcc']);
  });

  it('lockOwner holds the account row until the transaction ends', async () => {
    const lockedSql = sql`SELECT id FROM users WHERE id = ${biaId} FOR NO KEY UPDATE NOWAIT`;

    await runInTransaction(connection.db, async (tx) => {
      await new SavedColorsDao(tx).lockOwner(biaId);

      await expect(connection.db.execute(lockedSql)).rejects.toMatchObject({
        cause: { code: '55P03' },
      });
    });
    await expect(connection.db.execute(lockedSql)).resolves.toMatchObject({
      rows: [{ id: biaId }],
    });
  });

  it('lockOwner does not stop a row of another table from pointing at the account', async () => {
    await runInTransaction(connection.db, async (tx) => {
      await new SavedColorsDao(tx).lockOwner(biaId);

      await expect(
        connection.db.execute(sql`SELECT id FROM users WHERE id = ${biaId} FOR KEY SHARE NOWAIT`),
      ).resolves.toMatchObject({ rows: [{ id: biaId }] });
    });
  });
});
