import type {
  CampaignDetailDto,
  CampaignMemberDto,
  CampaignSummaryDto,
  CreateCampaignRequestDto,
} from '@lorkarium/contracts';
import { CampaignAccessBo } from './campaign-access.bo';
import { CampaignJoinBo } from './campaign-join.bo';
import type { CampaignListingRow, CampaignMemberRow } from './campaign-members.dao';
import type { CampaignMemberPo } from './campaign-members.po';
import type { CampaignPo, NewCampaignPo } from './campaigns.po';

/** One campaign as seen by one member: the row, their membership and everyone in it. */
export type CampaignView = Readonly<{
  campaign: CampaignPo;
  membership: CampaignMemberPo;
  members: readonly CampaignMemberRow[];
}>;

/** The view of the detail modal: the campaign view plus the id of the table's cast. */
export type CampaignDetailView = CampaignView & Readonly<{ castSceneId: string }>;

/** Listing row → DTO: one line of the user's campaign list.
 *
 *  Example: `rows.map(toCampaignSummaryDto)` */
export function toCampaignSummaryDto(row: CampaignListingRow): CampaignSummaryDto {
  const { campaign } = row;
  return {
    id: campaign.id,
    name: campaign.name,
    system: campaign.system,
    status: campaign.status,
    description: campaign.description,
    visibility: campaign.visibility,
    myRole: row.role,
    masterName: row.masterName,
    memberCount: row.memberCount,
    lastEnteredAt: row.lastEnteredAt?.toISOString() ?? null,
  };
}

/** View → DTO: the summary of a campaign assembled from its members instead of the listing query.
 *
 *  Example: `toCampaignSummaryOfView({ campaign, membership, members }).myRole // 'player'` */
export function toCampaignSummaryOfView(view: CampaignView): CampaignSummaryDto {
  return toCampaignSummaryDto({
    campaign: view.campaign,
    role: view.membership.role,
    joinedAt: view.membership.joinedAt,
    lastEnteredAt: view.membership.lastEnteredAt,
    masterName: masterNameOf(view),
    memberCount: view.members.length,
  });
}

/** View → DTO: the detail modal; the join code only reaches the master, the hash never leaves.
 *
 *  Example: `toCampaignDetailDto(view).joinCode // null for a player` */
export function toCampaignDetailDto(view: CampaignDetailView): CampaignDetailDto {
  const access = toCampaignAccessBo(view.campaign.id, view.membership.userId, view.membership);
  return {
    ...toCampaignSummaryOfView(view),
    members: sortedMembers(view.members),
    joinCode: access.canSeeJoinCode() ? view.campaign.joinCode : null,
    hasPassword: view.campaign.passwordHash !== null,
    castSceneId: view.castSceneId,
  };
}

/** Membership (or its absence) → BO for the access rules.
 *
 *  Example: `toCampaignAccessBo(campaignId, userId, await dao.findMembership(campaignId, userId)).requireMember()` */
export function toCampaignAccessBo(
  campaignId: string,
  userId: string,
  membership: CampaignMemberPo | undefined,
): CampaignAccessBo {
  return new CampaignAccessBo({ campaignId, userId, role: membership?.role ?? null });
}

/** Campaign + membership (or its absence) → BO for the join-by-code decision.
 *
 *  Example: `toCampaignJoinBo(campaign, undefined).needsPasswordCheck()` */
export function toCampaignJoinBo(
  campaign: CampaignPo,
  membership: CampaignMemberPo | undefined,
): CampaignJoinBo {
  return new CampaignJoinBo({
    campaignId: campaign.id,
    isMember: membership !== undefined,
    hasPassword: campaign.passwordHash !== null,
  });
}

function masterNameOf(view: CampaignView): string {
  const master = view.members.find((member) => member.role === 'master');
  if (master) return master.name;
  throw new Error(`campaign ${view.campaign.id} has no member with role master`);
}

/** The order every member list is shown in: the master first, then by name in pt-BR.
 *
 *  Example: `orderedMembers(await dao.listMembers(campaignId))[0].role // 'master'` */
export function orderedMembers(members: readonly CampaignMemberRow[]): CampaignMemberRow[] {
  return [...members].sort((a, b) => masterFirst(a, b) || a.name.localeCompare(b.name, 'pt-BR'));
}

function sortedMembers(members: readonly CampaignMemberRow[]): CampaignMemberDto[] {
  return orderedMembers(members).map(({ name, role }) => ({ name, role }));
}

function masterFirst(a: CampaignMemberRow, b: CampaignMemberRow): number {
  return Number(b.role === 'master') - Number(a.role === 'master');
}

/** DTO → PO: the row to insert; the plain password never reaches it, only its hash.
 *
 *  Example: `toNewCampaignPo(input, { ownerId: userId, joinCode: 'VHRN7K2Q', passwordHash: null })` */
export function toNewCampaignPo(
  input: CreateCampaignRequestDto,
  owned: Readonly<{ ownerId: string; joinCode: string; passwordHash: string | null }>,
): NewCampaignPo {
  return {
    name: input.name,
    system: input.system,
    status: input.status,
    description: input.description,
    visibility: input.visibility,
    ...owned,
  };
}
