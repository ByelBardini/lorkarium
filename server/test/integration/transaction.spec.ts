import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { runInTransaction } from '../../src/database/transaction';
import { users } from '../../src/modules/auth/users.po';
import { newUserPo } from '../support/auth-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

describe('runInTransaction on Postgres', () => {
  let connection: DatabaseConnection;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  beforeEach(() => truncateAllTables(connection.db));

  afterAll(() => connection.close());

  async function storedEmails(): Promise<string[]> {
    const rows = await connection.db.select({ email: users.email }).from(users);
    return rows.map((row) => row.email).sort();
  }

  it('commits every insert of the callback and returns what the callback returned', async () => {
    const returned = await runInTransaction(connection.db, async (tx) => {
      await tx.insert(users).values(newUserPo({ email: 'ana@mesa.com' }));
      await tx.insert(users).values(newUserPo({ email: 'bia@mesa.com' }));
      return 'both inserted';
    });
    expect(returned).toBe('both inserted');
    expect(await storedEmails()).toEqual(['ana@mesa.com', 'bia@mesa.com']);
  });

  it('a throw after an insert leaves no row and reaches the caller as the same error', async () => {
    const failure = new Error('second step failed');
    const run = runInTransaction(connection.db, async (tx) => {
      await tx.insert(users).values(newUserPo({ email: 'ana@mesa.com' }));
      throw failure;
    });
    await expect(run).rejects.toBe(failure);
    expect(await storedEmails()).toEqual([]);
  });
});
