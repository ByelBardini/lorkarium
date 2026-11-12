import type { UsersDao } from '../../src/modules/auth/users.dao';
import type { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import type { UserPlanPo } from '../../src/modules/auth/users.po';

/** The plan columns of an account: a plain user on `amigo_do_dono` (everything open), not the
 *  Dono do Lorkarium.
 *
 *  Example: `planAccount({ plan: 'free' })` */
export function planAccount(overrides: Partial<UserPlanPo> = {}): UserPlanPo {
  return {
    role: 'user',
    plan: 'amigo_do_dono',
    lorkariumOwner: false,
    ...overrides,
  };
}

/** The plan of each account in memory; an account not set answers `planAccount()`. `asked` keeps
 *  each account read, in order. */
export class PlanAccountsFake implements Pick<UsersDao, 'lockForPlan'> {
  readonly asked: string[] = [];
  private readonly accounts = new Map<string, UserPlanPo>();

  set(userId: string, account: UserPlanPo): this {
    this.accounts.set(userId, account);
    return this;
  }

  async lockForPlan(userId: string): Promise<UserPlanPo | undefined> {
    this.asked.push(userId);
    return this.accounts.get(userId) ?? planAccount();
  }
}

/** The plan of each table's owner, unlocked (a roll reads it); a table not set answers
 *  `planAccount()`, one in `missing` answers `undefined`. `asked` keeps each table read.
 *
 *  Example: `new TableOwnerPlansFake().set(VHARN_ID, planAccount({ plan: 'free' }))` */
export class TableOwnerPlansFake implements Pick<CampaignsDao, 'findOwnerPlan'> {
  readonly asked: string[] = [];
  readonly missing = new Set<string>();
  private readonly owners = new Map<string, UserPlanPo>();

  set(campaignId: string, owner: UserPlanPo): this {
    this.owners.set(campaignId, owner);
    return this;
  }

  async findOwnerPlan(campaignId: string): Promise<UserPlanPo | undefined> {
    this.asked.push(campaignId);
    if (this.missing.has(campaignId)) return undefined;
    return this.owners.get(campaignId) ?? planAccount();
  }
}
