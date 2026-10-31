import { and, desc, eq, getTableColumns, isNotNull, isNull, max, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DatabaseExecutor } from '../../database/transaction';
import { users, type UserPo } from '../auth/users.po';
import { campaignMembers } from './campaign-members.po';
import type { CampaignMemberPo, NewCampaignMemberPo } from './campaign-members.po';
import { campaigns, type CampaignPo } from './campaigns.po';

export type CampaignListingRow = Readonly<{
  campaign: CampaignPo;
  role: CampaignMemberPo['role'];
  /** The reader's juggernaut mode there (not null = on). */
  juggernautSince: Date | null;
  joinedAt: Date;
  lastEnteredAt: Date | null;
  masterName: string;
  memberCount: number;
}>;

/** One public campaign for "Explorar mesas", with the reader's role there (`null` = not in it).
 *  `masterName`/`masterUsername` are the owner's; `masterIds` every master of the table, for
 *  "a master is online". */
export type PublicCampaignRow = Readonly<{
  campaign: CampaignPo;
  masterIds: readonly string[];
  masterName: string;
  masterUsername: string;
  memberCount: number;
  myRole: CampaignMemberPo['role'] | null;
}>;

/** What turning juggernaut mode off did: the role the member went back to, or `null` when they
 *  were not a member before and their row is gone. */
export type JuggernautEnd = Readonly<{ restored: CampaignMemberPo['role'] | null }>;

/** The most "Explorar mesas" lists at once, newest first. */
export const PUBLIC_CAMPAIGNS_MAX = 200;

/** A member with what the table sees of their profile; `colorChoice` is null when the color is
 *  the automatic one (the mapper draws it with `memberColorOf`). `owner` = the creator of the
 *  campaign (`campaigns.owner_id`), the one master nobody demotes; `juggernaut` = an admin in
 *  juggernaut mode there. */
export type CampaignMemberRow = Readonly<{
  userId: string;
  name: string;
  username: string;
  colorChoice: UserPo['color'];
  avatarId: string | null;
  bio: string | null;
  role: CampaignMemberPo['role'];
  owner: boolean;
  juggernaut: boolean;
}>;

// The owner is the campaign's master in the listings: a co-master never duplicates the row.
const ownerUsers = alias(users, 'owner_user');
const readerMembers = alias(campaignMembers, 'reader_member');

// The table keeps no trace of who only watches nor of a juggernaut: neither counts.
const memberCountOfCampaign = sql<number>`(
  select count(*)::int from campaign_members counted
  where counted.campaign_id = ${campaigns.id} and counted.role <> 'spectator'
    and counted.juggernaut_since is null
)`;

const masterIdsOfCampaign = sql<string[]>`array(
  select masters.user_id from campaign_members masters
  where masters.campaign_id = ${campaigns.id} and masters.role = 'master'
)`;

export class CampaignMembersDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async insert(member: NewCampaignMemberPo): Promise<CampaignMemberPo> {
    const [row] = await this.db.insert(campaignMembers).values(member).returning();
    if (!row) throw new Error(`insert into campaign_members returned no row for ${member.userId}`);
    return row;
  }

  async findMembership(
    campaignId: string,
    userId: string,
    protect = false,
  ): Promise<CampaignMemberPo | undefined> {
    const query = this.db
      .select()
      .from(campaignMembers)
      .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)));
    const [row] = await (protect ? query.for('share') : query);
    return row;
  }

  /** The campaigns the user is a member of; the only filter is the user's own membership. */
  async listOfUser(userId: string): Promise<CampaignListingRow[]> {
    return this.db
      .select({
        campaign: getTableColumns(campaigns),
        role: campaignMembers.role,
        juggernautSince: campaignMembers.juggernautSince,
        joinedAt: campaignMembers.joinedAt,
        lastEnteredAt: campaignMembers.lastEnteredAt,
        masterName: ownerUsers.name,
        memberCount: memberCountOfCampaign,
      })
      .from(campaignMembers)
      .innerJoin(campaigns, eq(campaigns.id, campaignMembers.campaignId))
      .innerJoin(ownerUsers, eq(ownerUsers.id, campaigns.ownerId))
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
        masterIds: masterIdsOfCampaign,
        masterName: ownerUsers.name,
        masterUsername: ownerUsers.username,
        memberCount: memberCountOfCampaign,
        myRole: readerMembers.role,
      })
      .from(campaigns)
      .innerJoin(ownerUsers, eq(ownerUsers.id, campaigns.ownerId))
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
        owner: sql<boolean>`${campaigns.ownerId} = ${campaignMembers.userId}`,
        juggernaut: sql<boolean>`${campaignMembers.juggernautSince} is not null`,
      })
      .from(campaignMembers)
      .innerJoin(users, eq(users.id, campaignMembers.userId))
      .innerJoin(campaigns, eq(campaigns.id, campaignMembers.campaignId))
      .where(eq(campaignMembers.campaignId, campaignId));
  }

  /** The latest entry of a player or a master of the campaign (a spectator's or a juggernaut's
   *  entry is theirs, not the table's); `null` when none of them entered it yet. */
  async lastAccessAtOf(campaignId: string): Promise<Date | null> {
    const [row] = await this.db
      .select({ at: max(campaignMembers.lastEnteredAt) })
      .from(campaignMembers)
      .where(
        and(
          eq(campaignMembers.campaignId, campaignId),
          ne(campaignMembers.role, 'spectator'),
          isNull(campaignMembers.juggernautSince),
        ),
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

  /** Turns juggernaut mode on: the member becomes `master` (a non-member gets a row), keeping
   *  the role they had; asking again keeps the first instant and the role before.
   *
   *  Example: `await dao.startJuggernaut(vharnId, rootId, clock.now())` */
  async startJuggernaut(campaignId: string, userId: string, at: Date): Promise<CampaignMemberPo> {
    const fresh = {
      campaignId,
      userId,
      role: 'master' as const,
      joinedAt: at,
      juggernautSince: at,
    };
    const [row] = await this.db
      .insert(campaignMembers)
      .values(fresh)
      .onConflictDoUpdate({
        target: [campaignMembers.campaignId, campaignMembers.userId],
        set: {
          role: 'master',
          // The right side reads the row as it was: only the first turn-on keeps the role.
          juggernautSince: sql`coalesce(${campaignMembers.juggernautSince}, excluded.juggernaut_since)`,
          roleBeforeJuggernaut: sql`case when ${campaignMembers.juggernautSince} is null then ${campaignMembers.role} else ${campaignMembers.roleBeforeJuggernaut} end`,
        },
      })
      .returning();
    if (!row) throw new Error(`juggernaut of ${userId} in ${campaignId} returned no row`);
    return row;
  }

  /** Turns juggernaut mode off: back to the role before, or the row deleted when there was none;
   *  `undefined` when the mode was not on (nothing changes).
   *
   *  Example: `await dao.endJuggernaut(vharnId, rootId) // { restored: 'player' }` */
  async endJuggernaut(campaignId: string, userId: string): Promise<JuggernautEnd | undefined> {
    const inMode = and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.userId, userId),
      isNotNull(campaignMembers.juggernautSince),
    );
    const deleted = await this.db
      .delete(campaignMembers)
      .where(and(inMode, isNull(campaignMembers.roleBeforeJuggernaut)))
      .returning({ userId: campaignMembers.userId });
    if (deleted.length > 0) return { restored: null };
    const [row] = await this.db
      .update(campaignMembers)
      .set({
        role: sql`${campaignMembers.roleBeforeJuggernaut}`,
        juggernautSince: null,
        roleBeforeJuggernaut: null,
      })
      .where(inMode)
      .returning({ role: campaignMembers.role });
    return row && { restored: row.role };
  }

  /** The tables where the user has juggernaut mode on; only their own rows are read.
   *
   *  Example: `await dao.juggernautCampaignIdsOf(rootId) // [vharnId]` */
  async juggernautCampaignIdsOf(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ campaignId: campaignMembers.campaignId })
      .from(campaignMembers)
      .where(and(eq(campaignMembers.userId, userId), isNotNull(campaignMembers.juggernautSince)));
    return rows.map((row) => row.campaignId);
  }

  async markEntered(campaignId: string, userId: string, at: Date): Promise<void> {
    await this.db
      .update(campaignMembers)
      .set({ lastEnteredAt: at })
      .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)));
  }
}
