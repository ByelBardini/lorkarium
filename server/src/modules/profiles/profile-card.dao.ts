import { and, asc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { lorkariumOwnerSql } from '../../database/lorkarium-owner-sql';
import type { DatabaseExecutor } from '../../database/transaction';
import { activePaidPlanSql } from '../auth/users.dao';
import { users, type UserPlanPo, type UserPo } from '../auth/users.po';
import { campaignMembers } from '../campaigns/campaign-members.po';
import { campaigns } from '../campaigns/campaigns.po';
import { playingSeatOf } from '../reputation/reputation.dao';

/** The columns of another account its card shows (never the e-mail nor the password hash). */
export type ProfileCardAccountRow = Pick<UserPlanPo, 'activePaidPlan' | 'lorkariumOwner'> &
  Pick<
    UserPo,
    | 'id'
    | 'username'
    | 'name'
    | 'color'
    | 'bio'
    | 'avatarId'
    | 'bannerId'
    | 'gameSystems'
    | 'playSchedule'
    | 'contact'
    | 'rollsCount'
    | 'natural20Count'
    | 'createdAt'
    | 'role'
    | 'plan'
  >;

/** How many tables the account plays, by seat. */
export type ProfileCardSeatCounts = Readonly<{ asMaster: number; asPlayer: number }>;

export type MutualCampaignRow = Readonly<{ id: string; name: string }>;

const cardColumns = {
  id: users.id,
  username: users.username,
  name: users.name,
  color: users.color,
  bio: users.bio,
  avatarId: users.avatarId,
  bannerId: users.bannerId,
  gameSystems: users.gameSystems,
  playSchedule: users.playSchedule,
  contact: users.contact,
  rollsCount: users.rollsCount,
  natural20Count: users.natural20Count,
  createdAt: users.createdAt,
  role: users.role,
  plan: users.plan,
  activePaidPlan: activePaidPlanSql(),
  lorkariumOwner: lorkariumOwnerSql(users.username),
};

/** The reads of the profile card, one query per block (account, seats, tables and friends in
 *  common).
 *
 *  Example: `await new ProfileCardDao(db).accountOf(caioId) // undefined when suspended` */
export class ProfileCardDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** The account, only while active. Example: `(await cards.accountOf(caioId))?.username` */
  async accountOf(userId: string): Promise<ProfileCardAccountRow | undefined> {
    const [row] = await this.db
      .select(cardColumns)
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.suspendedAt)));
    return row;
  }

  /** The id behind an exact @ (already in lower case), only while active: a suspended account
   *  reads as unknown. Example: `await cards.accountIdByUsername('bia') // biaId` */
  async accountIdByUsername(username: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.username, username), isNull(users.suspendedAt)));
    return row?.id;
  }

  /** Example: `await cards.seatCountsOf(anaId) // { asMaster: 1, asPlayer: 0 }` */
  async seatCountsOf(userId: string): Promise<ProfileCardSeatCounts> {
    const [row] = await this.db
      .select({
        asMaster: sql<number>`count(*) filter (where ${campaignMembers.role} = 'master')::int`,
        asPlayer: sql<number>`count(*) filter (where ${campaignMembers.role} = 'player')::int`,
      })
      .from(campaignMembers)
      .where(playingSeatOf(campaignMembers, userId));
    return { asMaster: row?.asMaster ?? 0, asPlayer: row?.asPlayer ?? 0 };
  }

  /** The tables where both play, by name. Example: `await cards.mutualCampaignsOf(biaId, caioId)` */
  async mutualCampaignsOf(oneId: string, otherId: string): Promise<MutualCampaignRow[]> {
    const other = alias(campaignMembers, 'other_member');
    return this.db
      .select({ id: campaigns.id, name: campaigns.name })
      .from(campaignMembers)
      .innerJoin(other, eq(other.campaignId, campaignMembers.campaignId))
      .innerJoin(campaigns, eq(campaigns.id, campaignMembers.campaignId))
      .where(and(playingSeatOf(campaignMembers, oneId), playingSeatOf(other, otherId)))
      .orderBy(asc(campaigns.name), asc(campaigns.id));
  }

  /** Example: `await cards.mutualFriendsOf(biaId, caioId) // 2` */
  async mutualFriendsOf(oneId: string, otherId: string): Promise<number> {
    const result = await this.db.execute<{ count: number }>(sql`
      WITH one AS (${friendIdsOf(oneId)}), other AS (${friendIdsOf(otherId)})
      SELECT count(*)::int AS "count" FROM one INNER JOIN other ON one.id = other.id`);
    return result.rows[0]?.count ?? 0;
  }
}

function friendIdsOf(userId: string): SQL {
  return sql`SELECT CASE WHEN user_low = ${userId} THEN user_high ELSE user_low END AS id
    FROM friendships WHERE user_low = ${userId} OR user_high = ${userId}`;
}
