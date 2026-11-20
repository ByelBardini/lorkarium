import { and, asc, desc, eq, getTableColumns, inArray, ne, sql } from 'drizzle-orm';
import { lorkariumOwnerSql } from '../../database/lorkarium-owner-sql';
import type { DatabaseExecutor } from '../../database/transaction';
import { activePaidPlanSql, activePaidPlanUntilSql } from '../auth/users.dao';
import { users, type UserPo } from '../auth/users.po';
import { assets } from '../assets/assets.po';
import { campaignMembers } from '../campaigns/campaign-members.po';
import { campaigns } from '../campaigns/campaigns.po';

/** An account row with how many tables it is a member of and whether it is the Dono do
 *  Lorkarium (`lorkariumOwnerSql`). */
export type AccountListingRow = UserPo &
  Readonly<{
    campaignCount: number;
    lorkariumOwner: boolean;
    // The paid plan only while in force (the raw `paidPlan` of the row may have ended).
    activePaidPlan: UserPo['paidPlan'];
    activePaidPlanUntil: Date | null;
  }>;

/** A table the account owns, with how many other people are members of it. */
export type OwnedCampaignRow = Readonly<{ id: string; name: string; otherMembers: number }>;

const listingColumns = {
  ...getTableColumns(users),
  campaignCount: sql<number>`count(${campaignMembers.campaignId})::int`,
  lorkariumOwner: lorkariumOwnerSql(users.username),
  activePaidPlan: activePaidPlanSql(),
  activePaidPlanUntil: activePaidPlanUntilSql(),
};

/** The backoffice's reads and writes over `users` (the auth table) and the tables an account owns. */
export class UserAdminDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** Every account, the newest first. */
  async listAccounts(): Promise<AccountListingRow[]> {
    return this.db
      .select(listingColumns)
      .from(users)
      .leftJoin(campaignMembers, eq(campaignMembers.userId, users.id))
      .groupBy(users.id)
      .orderBy(desc(users.createdAt), asc(users.username));
  }

  async findAccount(userId: string): Promise<AccountListingRow | undefined> {
    const [row] = await this.db
      .select(listingColumns)
      .from(users)
      .leftJoin(campaignMembers, eq(campaignMembers.userId, users.id))
      .where(eq(users.id, userId))
      .groupBy(users.id);
    return row;
  }

  async setRole(userId: string, role: UserPo['role']): Promise<void> {
    await this.db.update(users).set({ role }).where(eq(users.id, userId));
  }

  async setPlan(userId: string, plan: UserPo['plan']): Promise<void> {
    await this.db.update(users).set({ plan }).where(eq(users.id, userId));
  }

  /** Suspends (with an end, or none) or, with `null`, lifts the suspension and its end together. */
  async setSuspendedAt(
    userId: string,
    suspendedAt: Date | null,
    suspendedUntil: Date | null = null,
  ): Promise<void> {
    const until = suspendedAt === null ? null : suspendedUntil;
    await this.db
      .update(users)
      .set({ suspendedAt, suspendedUntil: until })
      .where(eq(users.id, userId));
  }

  /** The tables `userId` owns, locked (`FOR UPDATE`) until the transaction ends, with the members
   *  counted after the lock: a join by code at the same time waits and then fails on the foreign
   *  key once the table is gone. */
  async lockOwnedCampaigns(userId: string): Promise<OwnedCampaignRow[]> {
    const owned = await this.db
      .select({ id: campaigns.id, name: campaigns.name })
      .from(campaigns)
      .where(eq(campaigns.ownerId, userId))
      .orderBy(asc(campaigns.createdAt))
      .for('update');
    if (owned.length === 0) return [];
    const others = await this.otherMembersOf(
      owned.map((campaign) => campaign.id),
      userId,
    );
    return owned.map((campaign) => ({ ...campaign, otherMembers: others.get(campaign.id) ?? 0 }));
  }

  /** The bucket keys of every file of the tables the account owns (they go with it by cascade).
   *  Called under `lockOwnedCampaigns`: an upload in flight to one of them has finished. */
  async storageKeysOfOwnedCampaigns(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ storageKey: assets.storageKey })
      .from(assets)
      .innerJoin(campaigns, eq(campaigns.id, assets.campaignId))
      .where(eq(campaigns.ownerId, userId))
      .orderBy(asc(assets.createdAt));
    return rows.map((row) => row.storageKey);
  }

  /** Deletes the account; its sessions, memberships, tables (and their scenes) go by cascade. */
  async delete(userId: string): Promise<void> {
    await this.db.delete(users).where(eq(users.id, userId));
  }

  private async otherMembersOf(
    campaignIds: readonly string[],
    userId: string,
  ): Promise<ReadonlyMap<string, number>> {
    const rows = await this.db
      .select({ campaignId: campaignMembers.campaignId, count: sql<number>`count(*)::int` })
      .from(campaignMembers)
      .where(
        and(
          inArray(campaignMembers.campaignId, [...campaignIds]),
          ne(campaignMembers.userId, userId),
        ),
      )
      .groupBy(campaignMembers.campaignId);
    return new Map(rows.map((row) => [row.campaignId, row.count]));
  }
}
