import type { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import type { PlansDao } from '../../src/modules/plans/plans.dao';
import type { UserPlanPo } from '../../src/modules/auth/users.po';

/** The plan columns of each account in memory, read without a lock; an account not set is gone. */
export class AccountPlansFake implements Pick<PlansDao, 'accountOf'> {
  private readonly accounts = new Map<string, UserPlanPo>();

  set(userId: string, account: UserPlanPo): this {
    this.accounts.set(userId, account);
    return this;
  }

  async accountOf(userId: string): Promise<UserPlanPo | undefined> {
    return this.accounts.get(userId);
  }
}

/** How many tables each account owns; an account not set owns none. */
export class OwnedCampaignsFake implements Pick<CampaignsDao, 'countOwnedBy'> {
  private readonly owned = new Map<string, number>();

  set(ownerId: string, total: number): this {
    this.owned.set(ownerId, total);
    return this;
  }

  async countOwnedBy(ownerId: string): Promise<number> {
    return this.owned.get(ownerId) ?? 0;
  }
}
