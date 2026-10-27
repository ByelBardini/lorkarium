import { isForeignKeyViolation } from '../../lib/postgres-error';
import type {
  AuthUserDto,
  CampaignSummaryDto,
  JoinCampaignRequestDto,
  JoinPublicCampaignRequestDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { PasswordHasherPort } from '../auth/password-hasher.port';
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

export type CampaignJoinServiceDeps = Readonly<{
  campaigns: Pick<CampaignsDao, 'findByJoinCode' | 'findById'>;
  members: Pick<CampaignMembersDao, 'findMembership' | 'insert' | 'listMembers' | 'markEntered'>;
  hasher: PasswordHasherPort;
  clock: ClockPort;
}>;

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
    const join = toCampaignJoinBo(campaign, existing, route === 'explore-as-admin');
    if (route !== 'by-code') join.requirePublic();
    const decision = join.decide(await this.checkPassword(join, campaign, password));
    const membership =
      decision === 'already-member' ? existing : await this.addSpectator(campaign, userId);
    return this.summaryOf(campaign, membership);
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

  private async addSpectator(campaign: CampaignPo, userId: string): Promise<CampaignMemberPo> {
    const joinedAt = this.deps.clock.now();
    try {
      return await this.deps.members.insert({
        campaignId: campaign.id,
        userId,
        role: 'spectator',
        joinedAt,
      });
    } catch (error) {
      // The table was deleted with its owner's account while this join waited on its lock.
      if (isForeignKeyViolation(error))
        throw new CampaignNotFoundError({ joinCode: campaign.joinCode });
      throw error;
    }
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
