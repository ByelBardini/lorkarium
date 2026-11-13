import { isForeignKeyViolation } from '../../lib/postgres-error';
import type {
  AuthUserDto,
  CampaignSummaryDto,
  JoinCampaignRequestDto,
  JoinPublicCampaignRequestDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { PasswordHasherPort } from '../auth/password-hasher.port';
import type { UserBlocksDao } from '../friends/user-blocks.dao';
import { effectiveLimitsOf, PlanLimitsBo } from '../plans/plan-limits.bo';
import { seesPrivateInExplore, type CampaignJoinBo, type PasswordCheck } from './campaign-join.bo';
import type { CampaignMembersDao } from './campaign-members.dao';
import type { CampaignMemberPo } from './campaign-members.po';
import type { CampaignsDao } from './campaigns.dao';
import { CampaignNotFoundError } from './campaigns.error';
import { toCampaignAccessBo, toCampaignJoinBo, toCampaignSummaryOfView } from './campaigns.mapper';
import type { CampaignPo } from './campaigns.po';

/** Who reads or joins from "Explorar mesas": the role decides whether private campaigns count. */
export type ExploreReader = Pick<AuthUserDto, 'id' | 'role'>;

type JoinRoute = 'by-code' | 'explore' | 'explore-as-admin';

/** What the seat's transaction writes with: the table locked with its owner's plan, and the
 *  spectators counted and inserted on the same `tx`. */
export type CampaignJoinWriteDaos = Readonly<{
  campaigns: Pick<CampaignsDao, 'lockWithOwner'>;
  members: Pick<CampaignMembersDao, 'countByRole' | 'insert'>;
}>;

export type CampaignJoinTransactionRunner = <T>(
  work: (daos: CampaignJoinWriteDaos) => Promise<T>,
) => Promise<T>;

export type CampaignJoinServiceDeps = Readonly<{
  campaigns: Pick<CampaignsDao, 'findByJoinCode' | 'findById'>;
  members: Pick<CampaignMembersDao, 'findMembership' | 'listMembers' | 'markEntered'>;
  /** A newcomer's seat: the spectators of the owner's plan are counted with the table locked. */
  transaction: CampaignJoinTransactionRunner;
  hasher: PasswordHasherPort;
  clock: ClockPort;
  /** Whether the owner of the table blocked the newcomer. */
  blocks: Pick<UserBlocksDao, 'exists'>;
}>;

type NewSpectator = Readonly<{ campaign: CampaignPo; userId: string; bypassedGate: boolean }>;

/** People getting into a campaign: by its join code or, when public, by picking it in "Explorar
 *  mesas" (as spectators, until the master promotes them), and into its table ("entrou por último").
 *
 *  Example: `await campaignJoinService.join(userOf(request).id, { code: 'VHRN7K2Q' })` */
export class CampaignJoinService {
  constructor(private readonly deps: CampaignJoinServiceDeps) {}

  async join(userId: string, input: JoinCampaignRequestDto): Promise<CampaignSummaryDto> {
    const campaign = await this.deps.campaigns.findByJoinCode(input.code);
    if (!campaign) throw new CampaignNotFoundError({ joinCode: input.code });
    return this.admit(userId, campaign, input.password, 'by-code');
  }

  /** Joining from "Explorar mesas": a public campaign, or any campaign for an admin (who skips
   *  the password too). */
  async joinPublic(
    reader: ExploreReader,
    campaignId: string,
    input: JoinPublicCampaignRequestDto,
  ): Promise<CampaignSummaryDto> {
    const campaign = await this.deps.campaigns.findById(campaignId);
    if (!campaign) throw new CampaignNotFoundError({ publicCampaignId: campaignId });
    const route = seesPrivateInExplore(reader.role) ? 'explore-as-admin' : 'explore';
    return this.admit(reader.id, campaign, input.password, route);
  }

  private async admit(
    userId: string,
    campaign: CampaignPo,
    password: string | undefined,
    route: JoinRoute,
  ): Promise<CampaignSummaryDto> {
    const existing = await this.deps.members.findMembership(campaign.id, userId);
    const join = await this.joinOf(campaign, existing, userId, route);
    join.requireNotBlocked();
    if (route !== 'by-code') join.requirePublic();
    const decision = join.decide(await this.checkPassword(join, campaign, password));
    const membership =
      decision === 'already-member'
        ? existing
        : await this.addSpectator({ campaign, userId, bypassedGate: join.bypassesGate() });
    return this.summaryOf(campaign, membership);
  }

  private async joinOf(
    campaign: CampaignPo,
    existing: CampaignMemberPo | undefined,
    userId: string,
    route: JoinRoute,
  ): Promise<CampaignJoinBo> {
    const blockedByOwner = await this.deps.blocks.exists(campaign.ownerId, userId);
    const readerIsAdmin = route === 'explore-as-admin';
    return toCampaignJoinBo(campaign, existing, { userId, readerIsAdmin, blockedByOwner });
  }

  async enter(userId: string, campaignId: string): Promise<void> {
    const membership = await this.deps.members.findMembership(campaignId, userId);
    toCampaignAccessBo(campaignId, userId, membership).requireViewer();
    await this.deps.members.markEntered(campaignId, userId, this.deps.clock.now());
  }

  private async checkPassword(
    join: CampaignJoinBo,
    campaign: CampaignPo,
    password: string | undefined,
  ): Promise<PasswordCheck> {
    if (!join.needsPasswordCheck() || !campaign.passwordHash) return 'not-required';
    if (!password) return 'missing';
    const matches = await this.deps.hasher.verify(campaign.passwordHash, password);
    return matches ? 'matches' : 'mismatch';
  }

  private async addSpectator(spectator: NewSpectator): Promise<CampaignMemberPo> {
    try {
      return await this.deps.transaction((daos) => this.seatSpectator(daos, spectator));
    } catch (error) {
      // The table was deleted with its owner's account while this join waited on its lock.
      if (isForeignKeyViolation(error))
        throw new CampaignNotFoundError({ joinCode: spectator.campaign.joinCode });
      throw error;
    }
  }

  // Every newcomer is a spectator, so the "table is full" of the plan is the spectators' ceiling.
  private async seatSpectator(
    { campaigns, members }: CampaignJoinWriteDaos,
    { campaign, userId, bypassedGate }: NewSpectator,
  ): Promise<CampaignMemberPo> {
    const locked = await campaigns.lockWithOwner(campaign.id);
    if (!locked) throw new CampaignNotFoundError({ joinCode: campaign.joinCode });
    const seated = await members.countByRole(campaign.id, 'spectator');
    PlanLimitsBo.requireRoom('spectators', seated, 1, effectiveLimitsOf(locked.owner));
    const joinedAt = this.deps.clock.now();
    const adminBypassSince = bypassedGate ? joinedAt : null;
    const seat = { campaignId: campaign.id, userId, role: 'spectator' as const };
    return members.insert({ ...seat, joinedAt, adminBypassSince });
  }

  private async summaryOf(
    campaign: CampaignPo,
    membership: CampaignMemberPo | undefined,
  ): Promise<CampaignSummaryDto> {
    if (!membership) throw new Error(`no membership after joining campaign ${campaign.id}`);
    const members = await this.deps.members.listMembers(campaign.id);
    return toCampaignSummaryOfView({ campaign, membership, members });
  }
}
