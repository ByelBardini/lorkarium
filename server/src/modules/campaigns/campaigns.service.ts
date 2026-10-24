import { isUniqueViolation } from '../../lib/postgres-error';
import type {
  CampaignDetailDto,
  CampaignSummaryDto,
  CreateCampaignRequestDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { PasswordHasherPort } from '../auth/password-hasher.port';
import { DEFAULT_CONDITIONS } from '../conditions/condition-rules.bo';
import type { ConditionsDao } from '../conditions/conditions.dao';
import { CAST_SCENE_NAME } from '../scenes/scenes.po';
import type { ScenesDao } from '../scenes/scenes.dao';
import type { MembershipReader } from './cached-memberships';
import type { CampaignCodePort } from './campaign-code.port';
import type { CampaignMemberRow, CampaignMembersDao } from './campaign-members.dao';
import type { CampaignsDao } from './campaigns.dao';
import { CampaignCodeExhaustedError } from './campaigns.error';
import {
  toCampaignAccessBo,
  toCampaignDetailDto,
  toCampaignSummaryDto,
  toNewCampaignPo,
  orderedMembers,
  type CampaignDetailView,
} from './campaigns.mapper';
import type { CampaignPo } from './campaigns.po';

/** The DAOs a transaction hands out, bound to the open `tx`. */
export type CampaignWriteDaos = Readonly<{
  campaigns: Pick<CampaignsDao, 'insert' | 'setActiveScene'>;
  members: Pick<CampaignMembersDao, 'insert'>;
  scenes: Pick<ScenesDao, 'insert'>;
  conditions: Pick<ConditionsDao, 'insertDefinitions'>;
}>;

export type CampaignTransactionRunner = <T>(
  work: (daos: CampaignWriteDaos) => Promise<T>,
) => Promise<T>;

export type CampaignsServiceDeps = Readonly<{
  campaigns: Pick<CampaignsDao, 'findById'>;
  members: Pick<
    CampaignMembersDao,
    'findMembership' | 'listOfUser' | 'listMembers' | 'campaignIdsOfUser'
  >;
  /** The cast of each table, whose id the detail carries. */
  scenes: Pick<ScenesDao, 'findCastOf'>;
  /** The remembered memberships: the roster of the live session (`session:join`) warms them for
   *  the board commands that follow. */
  memberships: MembershipReader;
  transaction: CampaignTransactionRunner;
  codes: CampaignCodePort;
  hasher: PasswordHasherPort;
  clock: ClockPort;
}>;

// 40-bit codes collide almost never; three tries turn a fluke into success and a bug into an error.
const MAX_CODE_ATTEMPTS = 3;

/** Create a campaign with its master, list the user's campaigns and show one of them.
 *
 *  Example: `await campaignsService.detail(userOf(request).id, params.campaignId)` */
export class CampaignsService {
  constructor(private readonly deps: CampaignsServiceDeps) {}

  async create(userId: string, input: CreateCampaignRequestDto): Promise<CampaignDetailDto> {
    const passwordHash = input.password ? await this.deps.hasher.hash(input.password) : null;
    const attempts: string[] = [];
    while (attempts.length < MAX_CODE_ATTEMPTS) {
      const joinCode = this.deps.codes.generate();
      attempts.push(joinCode);
      const created = await this.insertUnlessCodeTaken(userId, input, joinCode, passwordHash);
      if (created) return this.detail(userId, created.id);
    }
    throw new CampaignCodeExhaustedError(attempts);
  }

  async listMine(userId: string): Promise<CampaignSummaryDto[]> {
    const rows = await this.deps.members.listOfUser(userId);
    return rows.map(toCampaignSummaryDto);
  }

  async detail(userId: string, campaignId: string): Promise<CampaignDetailDto> {
    return toCampaignDetailDto(await this.viewOf(userId, campaignId));
  }

  /** The members with their ids, for another module (the live table session); same isolation as
   *  `detail`: someone who is not a member gets CAMPAIGN_NOT_FOUND.
   *
   *  Example: `await campaignsService.rosterOf(user.id, campaignId) // [{ userId, name, role }]` */
  async rosterOf(userId: string, campaignId: string): Promise<CampaignMemberRow[]> {
    const membership = await this.deps.memberships.findMembership(campaignId, userId);
    toCampaignAccessBo(campaignId, userId, membership).requireMember();
    return orderedMembers(await this.deps.memberships.listMembers(campaignId));
  }

  /** The ids of the user's campaigns, for another module (the live session tells each table of
   *  the person about a profile change); only the user's own memberships are read.
   *
   *  Example: `await campaignsService.campaignIdsOf(user.id) // [vharnId, quelmId]` */
  async campaignIdsOf(userId: string): Promise<string[]> {
    return this.deps.members.campaignIdsOfUser(userId);
  }

  private async viewOf(userId: string, campaignId: string): Promise<CampaignDetailView> {
    const membership = await this.deps.members.findMembership(campaignId, userId);
    toCampaignAccessBo(campaignId, userId, membership).requireMember();
    const campaign = await this.deps.campaigns.findById(campaignId);
    if (!membership || !campaign) throw new Error(`member of missing campaign ${campaignId}`);
    const members = await this.deps.members.listMembers(campaignId);
    const cast = await this.deps.scenes.findCastOf(campaignId);
    if (!cast) throw new Error(`campaign ${campaignId} has no cast; every campaign has one`);
    return { campaign, membership, members, castSceneId: cast.id };
  }

  private async insertUnlessCodeTaken(
    userId: string,
    input: CreateCampaignRequestDto,
    joinCode: string,
    passwordHash: string | null,
  ): Promise<CampaignPo | null> {
    const row = toNewCampaignPo(input, { ownerId: userId, joinCode, passwordHash });
    try {
      return await this.deps.transaction(async (daos) => {
        const campaign = await daos.campaigns.insert(row);
        const joinedAt = this.deps.clock.now();
        await daos.members.insert({ campaignId: campaign.id, userId, role: 'master', joinedAt });
        const scene = await daos.scenes.insert({ campaignId: campaign.id });
        await daos.campaigns.setActiveScene(campaign.id, scene.id);
        await daos.scenes.insert({ campaignId: campaign.id, name: CAST_SCENE_NAME, kind: 'cast' });
        await daos.conditions.insertDefinitions(campaign.id, DEFAULT_CONDITIONS);
        return { ...campaign, activeSceneId: scene.id };
      });
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }
}
