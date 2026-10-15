import type { CampaignSummaryDto, JoinCampaignRequestDto } from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { PasswordHasherPort } from '../auth/password-hasher.port';
import type { CampaignJoinBo, PasswordCheck } from './campaign-join.bo';
import type { CampaignMembersDao } from './campaign-members.dao';
import type { CampaignMemberPo } from './campaign-members.po';
import type { CampaignsDao } from './campaigns.dao';
import { CampaignNotFoundError } from './campaigns.error';
import { toCampaignAccessBo, toCampaignJoinBo, toCampaignSummaryOfView } from './campaigns.mapper';
import type { CampaignPo } from './campaigns.po';

export type CampaignJoinServiceDeps = Readonly<{
  campaigns: Pick<CampaignsDao, 'findByJoinCode'>;
  members: Pick<CampaignMembersDao, 'findMembership' | 'insert' | 'listMembers' | 'markEntered'>;
  hasher: PasswordHasherPort;
  clock: ClockPort;
}>;

/** Players getting into a campaign: by its join code, and into its table ("entrou por último").
 *
 *  Example: `await campaignJoinService.join(userOf(request).id, { code: 'VHRN7K2Q' })` */
export class CampaignJoinService {
  constructor(private readonly deps: CampaignJoinServiceDeps) {}

  async join(userId: string, input: JoinCampaignRequestDto): Promise<CampaignSummaryDto> {
    const campaign = await this.deps.campaigns.findByJoinCode(input.code);
    if (!campaign) throw new CampaignNotFoundError({ joinCode: input.code });
    const existing = await this.deps.members.findMembership(campaign.id, userId);
    const join = toCampaignJoinBo(campaign, existing);
    const decision = join.decide(await this.checkPassword(join, campaign, input.password));
    const membership =
      decision === 'already-member' ? existing : await this.addPlayer(campaign, userId);
    return this.summaryOf(campaign, membership);
  }

  async enter(userId: string, campaignId: string): Promise<void> {
    const membership = await this.deps.members.findMembership(campaignId, userId);
    toCampaignAccessBo(campaignId, userId, membership).requireMember();
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

  private addPlayer(campaign: CampaignPo, userId: string): Promise<CampaignMemberPo> {
    const joinedAt = this.deps.clock.now();
    return this.deps.members.insert({ campaignId: campaign.id, userId, role: 'player', joinedAt });
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
