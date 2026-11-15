import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { users } from '../../src/modules/auth/users.po';
import { DiceStatsDao } from '../../src/modules/dice/dice-stats.dao';
import { newUserPo } from '../support/auth-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

describe('DiceStatsDao on Postgres', () => {
  let connection: DatabaseConnection;
  let stats: DiceStatsDao;
  let anaId: string;
  let biaId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
    stats = new DiceStatsDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const accounts = new UsersDao(connection.db);
    anaId = (await accounts.insert(newUserPo({ name: 'Ana', email: 'ana@mesa.com' }))).id;
    biaId = (await accounts.insert(newUserPo({ name: 'Bia', email: 'bia@mesa.com' }))).id;
  });

  afterAll(() => connection.close());

  async function countersOf(userId: string): Promise<unknown> {
    const [row] = await connection.db
      .select({ rolls: users.rollsCount, natural20s: users.natural20Count })
      .from(users)
      .where(eq(users.id, userId));
    return row;
  }

  it('a new account starts with no rolls and no natural 20s', async () => {
    expect(await countersOf(anaId)).toEqual({ rolls: 0, natural20s: 0 });
  });

  it('two rolls at once both count, on that account only', async () => {
    await Promise.all([stats.addRoll(anaId, 1), stats.addRoll(anaId, 2)]);

    expect(await countersOf(anaId)).toEqual({ rolls: 2, natural20s: 3 });
    expect(await countersOf(biaId)).toEqual({ rolls: 0, natural20s: 0 });
  });
});
