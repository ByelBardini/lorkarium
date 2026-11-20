import { and, asc, count, eq, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DatabaseExecutor } from '../../database/transaction';
import { lorkariumOwnerSql } from '../../database/lorkarium-owner-sql';
import { PLAN_ACCOUNT_COLUMNS, activePaidPlanSql } from '../auth/users.dao';
import { users, type UserPlanPo } from '../auth/users.po';
import { campaignMembers } from '../campaigns/campaign-members.po';
import { campaigns } from '../campaigns/campaigns.po';
import {
  savedRolls,
  type NewSavedRollPo,
  type SavedRollChangesPo,
  type SavedRollPo,
} from './saved-rolls.po';

const older = alias(savedRolls, 'older');
const memberAccount = alias(users, 'member_account');

/** The two plans the ceiling of a member's saved rolls comes from, read with the membership. */
export type SavedRollPlansPo = Readonly<{ tableOwner: UserPlanPo; member: UserPlanPo }>;

/** The saved rolls of a member at a table: every query is keyed by the table and the owner, so a
 *  roll of someone else (or of another table) is never read, changed nor deleted. */
export class SavedRollsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** The owner's rolls in the order they were created.
   *
   *  Example: `const rolls = await dao.listOf(vharnId, biaId)` */
  async listOf(campaignId: string, userId: string): Promise<SavedRollPo[]> {
    return this.db
      .select()
      .from(savedRolls)
      .where(ownedBy(campaignId, userId))
      .orderBy(asc(savedRolls.createdAt), asc(savedRolls.id));
  }

  /** How many rolls the owner keeps at the table.
   *
   *  Example: `await dao.countOf(vharnId, biaId) // 2` */
  async countOf(campaignId: string, userId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(savedRolls)
      .where(ownedBy(campaignId, userId));
    return row?.total ?? 0;
  }

  /** How many of the owner's rolls at the table were born before `savedRollId`, by
   *  `(created_at, id)` (the order of `listOf`); `undefined` when the roll is not the owner's.
   *  Call it in the write's transaction, after `lockPlans`.
   *
   *  Example: `await rolls.rankOf(vharnId, biaId, rollId) // 3` */
  async rankOf(
    campaignId: string,
    userId: string,
    savedRollId: string,
  ): Promise<number | undefined> {
    const bornBefore = sql`(${older.createdAt}, ${older.id}) < (${savedRolls.createdAt}, ${savedRolls.id})`;
    const sameOwner = and(
      eq(older.campaignId, savedRolls.campaignId),
      eq(older.userId, savedRolls.userId),
      bornBefore,
    );
    const [row] = await this.db
      .select({ rank: count(older.id) })
      .from(savedRolls)
      .leftJoin(older, sameOwner)
      .where(and(ownedBy(campaignId, userId), eq(savedRolls.id, savedRollId)))
      .groupBy(savedRolls.id);
    return row?.rank;
  }

  /** Locks the owner's membership until the transaction ends, so two saves of the same member
   *  count one after the other, and reads in the same statement the plans the ceiling comes from:
   *  the table owner's and the member's own; `undefined` when the member is gone. `NO KEY UPDATE`
   *  and only on the membership: rows that only point at it are still inserted meanwhile, and the
   *  table, its owner and the member's account stay free. Call it on a DAO built with the `tx`.
   *
   *  Example: `const plans = await rolls.lockPlans(vharnId, biaId) // { tableOwner, member }` */
  async lockPlans(campaignId: string, userId: string): Promise<SavedRollPlansPo | undefined> {
    const [row] = await this.plansQuery(campaignId, userId).for('no key update', {
      of: campaignMembers,
    });
    return row;
  }

  /** The same two plans, without a lock: the list's `planLocked`.
   *
   *  Example: `await rolls.findPlans(vharnId, biaId) // { tableOwner, member }` */
  async findPlans(campaignId: string, userId: string): Promise<SavedRollPlansPo | undefined> {
    const [row] = await this.plansQuery(campaignId, userId);
    return row;
  }

  private plansQuery(campaignId: string, userId: string) {
    return this.db
      .select({ tableOwner: PLAN_ACCOUNT_COLUMNS, member: MEMBER_PLAN_COLUMNS })
      .from(campaignMembers)
      .innerJoin(campaigns, eq(campaigns.id, campaignMembers.campaignId))
      .innerJoin(users, eq(users.id, campaigns.ownerId))
      .innerJoin(memberAccount, eq(memberAccount.id, campaignMembers.userId))
      .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)))
      .$dynamic();
  }

  async insert(row: NewSavedRollPo): Promise<SavedRollPo> {
    const [inserted] = await this.db.insert(savedRolls).values(row).returning();
    if (!inserted) throw new Error(`insert of saved_rolls returned no row for ${row.name}`);
    return inserted;
  }

  /** Writes only the keys in `changes`; `undefined` when the roll is not the owner's.
   *
   *  Example: `await dao.update(vharnId, biaId, rollId, { parts })` */
  async update(
    campaignId: string,
    userId: string,
    savedRollId: string,
    changes: SavedRollChangesPo,
  ): Promise<SavedRollPo | undefined> {
    const [row] = await this.db
      .update(savedRolls)
      .set({ ...changes, updatedAt: sql`now()` })
      .where(and(ownedBy(campaignId, userId), eq(savedRolls.id, savedRollId)))
      .returning();
    return row;
  }

  /** `false` when the roll is not the owner's (or is already gone).
   *
   *  Example: `await dao.remove(vharnId, biaId, rollId) // true` */
  async remove(campaignId: string, userId: string, savedRollId: string): Promise<boolean> {
    const rows = await this.db
      .delete(savedRolls)
      .where(and(ownedBy(campaignId, userId), eq(savedRolls.id, savedRollId)))
      .returning({ id: savedRolls.id });
    return rows.length > 0;
  }
}

// Of the table owner (`users`) and of the member (`member_account`), as `PLAN_ACCOUNT_COLUMNS`.
const MEMBER_PLAN_COLUMNS = {
  role: memberAccount.role,
  plan: memberAccount.plan,
  activePaidPlan: activePaidPlanSql(memberAccount),
  lorkariumOwner: lorkariumOwnerSql(memberAccount.username),
};

function ownedBy(campaignId: string, userId: string): SQL | undefined {
  return and(eq(savedRolls.campaignId, campaignId), eq(savedRolls.userId, userId));
}
