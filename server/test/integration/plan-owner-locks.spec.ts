import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { runInTransaction, type Transaction } from '../../src/database/transaction';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { users } from '../../src/modules/auth/users.po';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

// Inside the second transaction: give up on a held row lock at once instead of waiting.
async function failFastOnLocks(tx: Transaction): Promise<void> {
  await tx.execute(sql`SET LOCAL lock_timeout = '200ms'`);
}

describe('the plan read under the lock: CampaignsDao.lockWithOwner and UsersDao.lockForPlan', () => {
  let connection: DatabaseConnection;
  let biaId: string;
  let caioId: string;
  let biaTableId: string;
  let caioTableId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const accounts = new UsersDao(connection.db);
    biaId = (await accounts.insert(newUserPo({ email: 'bia@mesa.com', name: 'Bia' }))).id;
    caioId = (await accounts.insert(newUserPo({ email: 'caio@mesa.com', name: 'Caio' }))).id;
    await connection.db.update(users).set({ plan: 'lenda' }).where(eq(users.id, caioId));
    const tables = new CampaignsDao(connection.db);
    biaTableId = (await tables.insert(newCampaignPo({ ownerId: biaId, joinCode: 'BIAA2345' }))).id;
    caioTableId = (await tables.insert(newCampaignPo({ ownerId: caioId, joinCode: 'CAIO2345' })))
      .id;
  });

  afterAll(() => connection.close());

  it('lockWithOwner brings the campaign row and the plan of its owner', async () => {
    const row = await runInTransaction(connection.db, (tx) =>
      new CampaignsDao(tx).lockWithOwner(biaTableId),
    );
    expect(row).toMatchObject({
      id: biaTableId,
      ownerId: biaId,
      owner: { role: 'user', plan: 'free', lorkariumOwner: false },
    });
  });

  it('each table reads the plan of its own owner', async () => {
    const row = await runInTransaction(connection.db, (tx) =>
      new CampaignsDao(tx).lockWithOwner(caioTableId),
    );
    expect(row?.owner).toEqual({
      role: 'user',
      plan: 'lenda',
      lorkariumOwner: false,
    });
  });

  it('lockWithOwner of an unknown campaign is undefined', async () => {
    const row = await runInTransaction(connection.db, (tx) =>
      new CampaignsDao(tx).lockWithOwner(randomUUID()),
    );
    expect(row).toBeUndefined();
  });

  it('lockWithOwner holds the campaign row but leaves the owner row free', async () => {
    await runInTransaction(connection.db, async (tx) => {
      await new CampaignsDao(tx).lockWithOwner(biaTableId);
      const owner = runInTransaction(connection.db, async (other) => {
        await failFastOnLocks(other);
        return new UsersDao(other).lockForPlan(biaId);
      });
      const table = runInTransaction(connection.db, async (other) => {
        await failFastOnLocks(other);
        return new CampaignsDao(other).lockById(biaTableId);
      });
      await expect(owner).resolves.toEqual({
        role: 'user',
        plan: 'free',
        lorkariumOwner: false,
      });
      await expect(table).rejects.toMatchObject({ cause: { code: '55P03' } });
    });
  });

  it('lockForPlan reads the role, the plan and the mark, and holds the row', async () => {
    await runInTransaction(connection.db, async (tx) => {
      expect(await new UsersDao(tx).lockForPlan(caioId)).toEqual({
        role: 'user',
        plan: 'lenda',
        lorkariumOwner: false,
      });
      const second = runInTransaction(connection.db, async (other) => {
        await failFastOnLocks(other);
        return new UsersDao(other).lockForPlan(caioId);
      });
      await expect(second).rejects.toMatchObject({ cause: { code: '55P03' } });
    });
  });

  it('lockForPlan of an unknown account is undefined', async () => {
    expect(await new UsersDao(connection.db).lockForPlan(randomUUID())).toBeUndefined();
  });
});
