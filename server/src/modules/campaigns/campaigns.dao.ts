import { asc, count, eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { PLAN_ACCOUNT_COLUMNS } from '../auth/users.dao';
import { users, type UserPlanPo } from '../auth/users.po';
import { campaigns, type CampaignPo, type NewCampaignPo } from './campaigns.po';

/** The two table settings that open tokens to players. */
export type CampaignTokenRightsPo = Pick<CampaignPo, 'playersCreateTokens' | 'playersDeleteTokens'>;

/** The campaign row with what decides its limits: the owner's role, plan and Dono flag. */
export type CampaignWithOwnerPo = CampaignPo & Readonly<{ owner: UserPlanPo }>;

export class CampaignsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async insert(campaign: NewCampaignPo): Promise<CampaignPo> {
    const [row] = await this.db.insert(campaigns).values(campaign).returning();
    if (!row) throw new Error(`insert into campaigns returned no row for name ${campaign.name}`);
    return row;
  }

  async findById(campaignId: string): Promise<CampaignPo | undefined> {
    const [row] = await this.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    return row;
  }

  /** The campaign, locked until the transaction ends: the library edits of one table queue
   *  here, so two of them never decide on the same tree. `NO KEY UPDATE`, so rows that only
   *  point at the campaign (an asset, a folder) are still inserted meanwhile. Call it on a DAO
   *  built with the `tx`. */
  async lockById(campaignId: string): Promise<CampaignPo | undefined> {
    const [row] = await this.db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .for('no key update');
    return row;
  }

  /** `lockById` plus the owner's plan, in the same statement: the limits of the table are read
   *  where the write already queues, never from a cache (a plan changed in the backoffice counts at
   *  once). Only the campaign row is locked, never the owner's.
   *
   *  Example: `effectiveLimitsOf((await new CampaignsDao(tx).lockWithOwner(campaignId))!.owner)` */
  async lockWithOwner(campaignId: string): Promise<CampaignWithOwnerPo | undefined> {
    const [row] = await this.db
      .select({
        campaign: campaigns,
        owner: PLAN_ACCOUNT_COLUMNS,
      })
      .from(campaigns)
      .innerJoin(users, eq(users.id, campaigns.ownerId))
      .where(eq(campaigns.id, campaignId))
      .for('no key update', { of: campaigns });
    return row && { ...row.campaign, owner: row.owner };
  }

  /** The owner's plan alone, without a lock: what a write that keeps nothing (a dice roll) reads
   *  of the table's limits; `undefined` = no table.
   *
   *  Example: `effectiveLimitsOf((await new CampaignsDao(db).findOwnerPlan(campaignId))!)` */
  async findOwnerPlan(campaignId: string): Promise<UserPlanPo | undefined> {
    const [row] = await this.db
      .select(PLAN_ACCOUNT_COLUMNS)
      .from(campaigns)
      .innerJoin(users, eq(users.id, campaigns.ownerId))
      .where(eq(campaigns.id, campaignId));
    return row;
  }

  /** How many tables `ownerId` owns, of any status (a finished one still counts against the plan).
   *  Inside the creation's transaction, after `UsersDao.lockForPlan(ownerId)`, two creations of the
   *  same owner never both count the same number.
   *
   *  Example: `await new CampaignsDao(tx).countOwnedBy(ownerId) // 1` */
  async countOwnedBy(ownerId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(campaigns)
      .where(eq(campaigns.ownerId, ownerId));
    return row?.total ?? 0;
  }

  /** The ids of the tables `ownerId` owns, the oldest first: each one's limits follow that plan.
   *
   *  Example: `await campaignsDao.idsOwnedBy(biaId) // [tavernId]` */
  async idsOwnedBy(ownerId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(eq(campaigns.ownerId, ownerId))
      .orderBy(asc(campaigns.createdAt), asc(campaigns.id));
    return rows.map((row) => row.id);
  }

  async setActiveScene(campaignId: string, sceneId: string): Promise<void> {
    await this.db
      .update(campaigns)
      .set({ activeSceneId: sceneId })
      .where(eq(campaigns.id, campaignId));
  }

  /** Writes the settings; `undefined` when the campaign is gone. Only the fields present change.
   *
   *  Example: `await dao.update(campaignId, { name: 'Vharn', updatedAt: now })` */
  async update(campaignId: string, patch: Partial<NewCampaignPo>): Promise<CampaignPo | undefined> {
    const [row] = await this.db
      .update(campaigns)
      .set(patch)
      .where(eq(campaigns.id, campaignId))
      .returning();
    return row;
  }

  /** A new join code; a taken one throws the unique violation (`23505`), like `insert`. */
  async replaceJoinCode(campaignId: string, joinCode: string, at: Date): Promise<boolean> {
    const rows = await this.db
      .update(campaigns)
      .set({ joinCode, updatedAt: at })
      .where(eq(campaigns.id, campaignId))
      .returning({ id: campaigns.id });
    return rows.length > 0;
  }

  /** Deletes the campaign; the foreign keys cascade to everything of it (members, scenes and what
   *  is on them, sheets, conditions, folders, assets). `false` when it was already gone. */
  async delete(campaignId: string): Promise<boolean> {
    const rows = await this.db
      .delete(campaigns)
      .where(eq(campaigns.id, campaignId))
      .returning({ id: campaigns.id });
    return rows.length > 0;
  }

  /** The token settings of the table, read on every token command of a player (turning one off
   *  counts from the next command on); `undefined` when the campaign is gone.
   *
   *  Example: `await dao.tokenRightsOf(campaignId) // { playersCreateTokens: true, … }` */
  async tokenRightsOf(campaignId: string): Promise<CampaignTokenRightsPo | undefined> {
    const [row] = await this.db
      .select({
        playersCreateTokens: campaigns.playersCreateTokens,
        playersDeleteTokens: campaigns.playersDeleteTokens,
      })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId));
    return row;
  }

  async findByJoinCode(joinCode: string): Promise<CampaignPo | undefined> {
    const [row] = await this.db.select().from(campaigns).where(eq(campaigns.joinCode, joinCode));
    return row;
  }
}
