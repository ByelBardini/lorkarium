import { and, desc, eq, getTableColumns, max, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DatabaseExecutor } from '../../database/transaction';
import { users, type UserPo } from '../auth/users.po';
import { campaignMembers } from './campaign-members.po';
import type { CampaignMemberPo, NewCampaignMemberPo } from './campaign-members.po';
import { campaigns, type CampaignPo } from './campaigns.po';

export type CampaignListingRow = Readonly<{
  campaign: CampaignPo;
  role: CampaignMemberPo['role'];
  joinedAt: Date;
  lastEnteredAt: Date | null;
  masterName: string;
  memberCount: number;
}>;

/** One public campaign for "Explorar mesas", with the reader's role there (`null` = not in it). */
export type PublicCampaignRow = Readonly<{
  campaign: CampaignPo;
  masterId: string;
  masterName: string;
  masterUsername: string;
  memberCount: number;
  myRole: CampaignMemberPo['role'] | null;
}>;

/** The most "Explorar mesas" lists at once, newest first. */
export const PUBLIC_CAMPAIGNS_MAX = 200;

/** A member with what the table sees of their profile; `colorChoice` is null when the color is
 *  the automatic one (the mapper draws it with `memberColorOf`). */
export type CampaignMemberRow = Readonly<{
  userId: string;
  name: string;
  username: string;
  colorChoice: UserPo['color'];
  avatarId: string | null;
  bio: string | null;
  role: CampaignMemberPo['role'];
}>;

const masterMembers = alias(campaignMembers, 'master_member');
const masterUsers = alias(users, 'master_user');
const readerMembers = alias(campaignMembers, 'reader_member');

// The table keeps no trace of who only watches: spectators do not count.
const memberCountOfCampaign = sql<number>`(
  select count(*)::int from campaign_members counted
  where counted.campaign_id = ${campaigns.id} and counted.role <> 'spectator'
)`;

export class CampaignMembersDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async insert(member: NewCampaignMemberPo): Promise<CampaignMemberPo> {
    const [row] = await this.db.insert(campaignMembers).values(member).returning();
    if (!row) throw new Error(`insert into campaign_members returned no row for ${member.userId}`);
    return row;
  }

  async findMembership(campaignId: string, userId: string): Promise<CampaignMemberPo | undefined> {
    const [row] = await this.db
      .select()
      .from(campaignMembers)
      .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)));
    return row;
  }

  /** The campaigns the user is a member of; the only filter is the user's own membership. */
  async listOfUser(userId: string): Promise<CampaignListingRow[]> {
    return this.db
      .select({
        campaign: getTableColumns(campaigns),
        role: campaignMembers.role,
        joinedAt: campaignMembers.joinedAt,
        lastEnteredAt: campaignMembers.lastEnteredAt,
        masterName: masterUsers.name,
        memberCount: memberCountOfCampaign,
      })
      .from(campaignMembers)
      .innerJoin(campaigns, eq(campaigns.id, campaignMembers.campaignId))
      .innerJoin(
        masterMembers,
        and(eq(masterMembers.campaignId, campaigns.id), eq(masterMembers.role, 'master')),
      )
      .innerJoin(masterUsers, eq(masterUsers.id, masterMembers.userId))
      .where(eq(campaignMembers.userId, userId))
      .orderBy(
        sql`${campaignMembers.lastEnteredAt} desc nulls last`,
        desc(campaignMembers.joinedAt),
      );
  }

  /** Every public campaign (every campaign with `includePrivate`, for an admin), newest first (up
   *  to `PUBLIC_CAMPAIGNS_MAX`), with the reader's role in each; the filter is the visibility the
   *  master chose, not a membership. */
  async listPublic(readerId: string, includePrivate: boolean): Promise<PublicCampaignRow[]> {
    return this.db
      .select({
        campaign: getTableColumns(campaigns),
        masterId: masterUsers.id,
        masterName: masterUsers.name,
        masterUsername: masterUsers.username,
        memberCount: memberCountOfCampaign,
        myRole: readerMembers.role,
      })
      .from(campaigns)
      .innerJoin(
        masterMembers,
        and(eq(masterMembers.campaignId, campaigns.id), eq(masterMembers.role, 'master')),
      )
      .innerJoin(masterUsers, eq(masterUsers.id, masterMembers.userId))
      .leftJoin(
        readerMembers,
        and(eq(readerMembers.campaignId, campaigns.id), eq(readerMembers.userId, readerId)),
      )
      .where(includePrivate ? undefined : eq(campaigns.visibility, 'public'))
      .orderBy(desc(campaigns.createdAt))
      .limit(PUBLIC_CAMPAIGNS_MAX);
  }

  /** The ids of the campaigns the user is a member of; no join, the caller only needs the ids. */
  async campaignIdsOfUser(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ campaignId: campaignMembers.campaignId })
      .from(campaignMembers)
      .where(eq(campaignMembers.userId, userId));
    return rows.map((row) => row.campaignId);
  }

  async listMembers(campaignId: string): Promise<CampaignMemberRow[]> {
    return this.db
      .select({
        userId: users.id,
        name: users.name,
        username: users.username,
        colorChoice: users.color,
        avatarId: users.avatarId,
        bio: users.bio,
        role: campaignMembers.role,
      })
      .from(campaignMembers)
      .innerJoin(users, eq(users.id, campaignMembers.userId))
      .where(eq(campaignMembers.campaignId, campaignId));
  }

  /** The latest entry of a player or the master of the campaign (a spectator's entry is theirs,
   *  not the table's); `null` when none of them entered it yet. */
  async lastAccessAtOf(campaignId: string): Promise<Date | null> {
    const [row] = await this.db
      .select({ at: max(campaignMembers.lastEnteredAt) })
      .from(campaignMembers)
      .where(
        and(eq(campaignMembers.campaignId, campaignId), ne(campaignMembers.role, 'spectator')),
      );
    return row?.at ?? null;
  }

  /** Writes the member's new role; `undefined` when `userId` is not a member of the campaign.
   *
   *  Example: `await dao.updateRole(vharnId, dudaId, 'player')` */
  async updateRole(
    campaignId: string,
    userId: string,
    role: CampaignMemberPo['role'],
  ): Promise<CampaignMemberPo | undefined> {
    const [row] = await this.db
      .update(campaignMembers)
      .set({ role })
      .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)))
      .returning();
    return row;
  }

  async markEntered(campaignId: string, userId: string, at: Date): Promise<void> {
    await this.db
      .update(campaignMembers)
      .set({ lastEnteredAt: at })
      .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)));
  }
}
