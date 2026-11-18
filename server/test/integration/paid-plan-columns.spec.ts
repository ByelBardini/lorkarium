import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { PLAN_ACCOUNT_COLUMNS, UsersDao } from '../../src/modules/auth/users.dao';
import { users } from '../../src/modules/auth/users.po';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const CHECK_VIOLATION = '23514';

describe('the paid plan columns of users', () => {
  let connection: DatabaseConnection;
  let anaId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    anaId = (await new UsersDao(connection.db).insert(newUserPo())).id;
  });

  afterAll(() => connection.close());

  async function payUntil(interval: string): Promise<void> {
    await connection.db
      .update(users)
      .set({ paidPlan: 'lenda', paidPlanUntil: sql`now() + ${interval}::interval` })
      .where(eq(users.id, anaId));
  }

  async function paidPlanOfAna() {
    const [row] = await connection.db
      .select(PLAN_ACCOUNT_COLUMNS)
      .from(users)
      .where(eq(users.id, anaId));
    return row?.activePaidPlan;
  }

  it('a paid Lenda valid until tomorrow is read as lenda', async () => {
    await payUntil('1 day');
    expect(await paidPlanOfAna()).toBe('lenda');
  });

  it('a paid plan that ended a second ago is read as null', async () => {
    await payUntil('-1 second');
    expect(await paidPlanOfAna()).toBeNull();
  });

  it('an account that never paid reads null', async () => {
    expect(await paidPlanOfAna()).toBeNull();
  });

  it('the CHECK refuses a paid plan without its end', async () => {
    const insert = new UsersDao(connection.db).insert(
      newUserPo({ username: 'bia', email: 'bia@mesa.com', paidPlan: 'narrador' }),
    );
    await expect(insert).rejects.toMatchObject({ cause: { code: CHECK_VIOLATION } });
  });

  it('the CHECK refuses selling the amigo_do_dono', async () => {
    const write = connection.db
      .update(users)
      .set({ paidPlan: 'amigo_do_dono', paidPlanUntil: sql`now() + interval '1 day'` })
      .where(eq(users.id, anaId));
    await expect(write).rejects.toMatchObject({ cause: { code: CHECK_VIOLATION } });
  });

  it('lockWithOwner brings the paid plan of the owner of the table', async () => {
    await payUntil('1 day');
    const campaign = await new CampaignsDao(connection.db).insert(
      newCampaignPo({ ownerId: anaId }),
    );

    const locked = await connection.db.transaction((tx) =>
      new CampaignsDao(tx).lockWithOwner(campaign.id),
    );

    expect(locked?.owner).toMatchObject({ plan: 'free', activePaidPlan: 'lenda' });
  });
});
