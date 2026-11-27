import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DatabaseExecutor } from '../../database/transaction';
import { lorkariumOwnerSql } from '../../database/lorkarium-owner-sql';
import { PLAN_ACCOUNT_COLUMNS, activePaidPlanSql } from '../auth/users.dao';
import { users, type UserPlanPo } from '../auth/users.po';
import { campaignMembers } from '../campaigns/campaign-members.po';
import { campaigns } from '../campaigns/campaigns.po';

const memberAccount = alias(users, 'member_account');

/** The two plans the ceiling of a member's own items (saved rolls, saved tokens) comes from. */
export type MemberPlansPo = Readonly<{ tableOwner: UserPlanPo; member: UserPlanPo }>;

/** The plan of the table owner and the member's own, read with the membership. */
export class MemberPlansDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** Locks the member's membership until the transaction ends, so two saves of the same member
   *  count one after the other, and reads in the same statement the two plans; `undefined` when
   *  the member is gone. `NO KEY UPDATE` and only on the membership: rows that only point at it
   *  are still inserted meanwhile, and the table, its owner and the member's account stay free.
   *  Call it on a DAO built with the `tx`.
   *
   *  Example: `const plans = await new MemberPlansDao(tx).lock(vharnId, biaId)` */
  async lock(campaignId: string, userId: string): Promise<MemberPlansPo | undefined> {
    const [row] = await this.query(campaignId, userId).for('no key update', {
      of: campaignMembers,
    });
    return row;
  }

  /** The same two plans, without a lock: a list's `planLocked`.
   *
   *  Example: `await new MemberPlansDao(db).find(vharnId, biaId) // { tableOwner, member }` */
  async find(campaignId: string, userId: string): Promise<MemberPlansPo | undefined> {
    const [row] = await this.query(campaignId, userId);
    return row;
  }

  private query(campaignId: string, userId: string) {
    return this.db
      .select({ tableOwner: PLAN_ACCOUNT_COLUMNS, member: MEMBER_PLAN_COLUMNS })
      .from(campaignMembers)
      .innerJoin(campaigns, eq(campaigns.id, campaignMembers.campaignId))
      .innerJoin(users, eq(users.id, campaigns.ownerId))
      .innerJoin(memberAccount, eq(memberAccount.id, campaignMembers.userId))
      .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)))
      .$dynamic();
  }
}

// Of the table owner (`users`) and of the member (`member_account`), as `PLAN_ACCOUNT_COLUMNS`.
const MEMBER_PLAN_COLUMNS = {
  role: memberAccount.role,
  plan: memberAccount.plan,
  activePaidPlan: activePaidPlanSql(memberAccount),
  lorkariumOwner: lorkariumOwnerSql(memberAccount.username),
};
