import type {
  CampaignDetailDto,
  CampaignSummaryDto,
  CreateCampaignRequestDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { PasswordHasherPort } from '../auth/password-hasher.port';
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
  type CampaignView,
} from './campaigns.mapper';
import type { CampaignPo } from './campaigns.po';

/** The DAOs a transaction hands out, bound to the open `tx`. */
export type CampaignWriteDaos = Readonly<{
  campaigns: Pick<CampaignsDao, 'insert'>;
  members: Pick<CampaignMembersDao, 'insert'>;
}>;

export type CampaignTransactionRunner = <T>(
  work: (daos: CampaignWriteDaos) => Promise<T>,
) => Promise<T>;

export type CampaignsServiceDeps = Readonly<{
  campaigns: Pick<CampaignsDao, 'findById'>;
  members: Pick<CampaignMembersDao, 'findMembership' | 'listOfUser' | 'listMembers'>;
  transaction: CampaignTransactionRunner;
  codes: CampaignCodePort;
  hasher: PasswordHasherPort;
  clock: ClockPort;
}>;

// 40-bit codes collide almost never; three tries turn a fluke into success and a bug into an error.
const MAX_CODE_ATTEMPTS = 3;
const UNIQUE_VIOLATION = '23505';

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
    const membership = await this.deps.members.findMembership(campaignId, userId);
    toCampaignAccessBo(campaignId, userId, membership).requireMember();
    return orderedMembers(await this.deps.members.listMembers(campaignId));
  }

  private async viewOf(userId: string, campaignId: string): Promise<CampaignView> {
    const membership = await this.deps.members.findMembership(campaignId, userId);
    toCampaignAccessBo(campaignId, userId, membership).requireMember();
    const campaign = await this.deps.campaigns.findById(campaignId);
    if (!membership || !campaign) throw new Error(`member of missing campaign ${campaignId}`);
    const members = await this.deps.members.listMembers(campaignId);
    return { campaign, membership, members };
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
        return campaign;
      });
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const cause: unknown = error.cause;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    cause.code === UNIQUE_VIOLATION
  );
}
