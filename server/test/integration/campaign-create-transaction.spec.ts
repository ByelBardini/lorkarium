import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { runInTransaction } from '../../src/database/transaction';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { CampaignMembersDao } from '../../src/modules/campaigns/campaign-members.dao';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import {
  CampaignsService,
  type CampaignTransactionRunner,
} from '../../src/modules/campaigns/campaigns.service';
import { campaigns } from '../../src/modules/campaigns/campaigns.po';
import { campaignMembers } from '../../src/modules/campaigns/campaign-members.po';
import { ConditionsDao } from '../../src/modules/conditions/conditions.dao';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import type { NewScenePo, ScenePo } from '../../src/modules/scenes/scenes.po';
import { ClockFake, PasswordHasherFake } from '../support/auth-fakes';
import { newUserPo } from '../support/auth-factories';
import { CampaignCodeFake } from '../support/campaigns-fakes';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const NEW_CAMPAIGN = {
  name: 'Vharn',
  system: null,
  status: null,
  description: null,
  visibility: 'private',
} as const;

/** A scenes DAO whose insert always fails, as a lost connection or a constraint would. */
class FailingScenesDao {
  async insert(scene: NewScenePo): Promise<ScenePo> {
    throw new Error(`scene insert failed for campaign ${scene.campaignId}`);
  }
}

describe('creating a campaign on Postgres', () => {
  let connection: DatabaseConnection;
  let ownerId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    ownerId = (await new UsersDao(connection.db).insert(newUserPo())).id;
  });

  afterAll(() => connection.close());

  it('a failure while writing the scene rolls back the campaign and its master', async () => {
    const { db } = connection;
    const transaction: CampaignTransactionRunner = (work) =>
      runInTransaction(db, (tx) =>
        work({
          campaigns: new CampaignsDao(tx),
          members: new CampaignMembersDao(tx),
          scenes: new FailingScenesDao(),
          conditions: new ConditionsDao(tx),
        }),
      );
    const service = new CampaignsService({
      campaigns: new CampaignsDao(db),
      members: new CampaignMembersDao(db),
      scenes: new ScenesDao(db),
      memberships: new CampaignMembersDao(db),
      transaction,
      codes: new CampaignCodeFake(['VHRN7K2Q']),
      hasher: new PasswordHasherFake(),
      clock: new ClockFake(new Date('2026-10-15T12:00:00Z')),
    });
    await expect(service.create(ownerId, NEW_CAMPAIGN)).rejects.toThrow(/scene insert failed/);
    expect(await db.select().from(campaigns)).toEqual([]);
    expect(await db.select().from(campaignMembers)).toEqual([]);
  });
});
