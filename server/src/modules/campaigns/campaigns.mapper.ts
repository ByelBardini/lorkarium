import {
  contentWarningDto,
  type CampaignCoverDto,
  type CampaignDetailDto,
  type CampaignInfoDto,
  type CampaignMemberDto,
  type CampaignSummaryDto,
  type ContentWarningDto,
  type CreateCampaignRequestDto,
  type UpdateCampaignRequestDto,
} from '@lorkarium/contracts';
import { defaultCoverOf, memberColorOf } from '@lorkarium/game-core';
import { CampaignAccessBo } from './campaign-access.bo';
import { CampaignJoinBo } from './campaign-join.bo';
import { CampaignSettingsBo } from './campaign-settings.bo';
import { MemberRoleBo } from './member-role.bo';
import type { CampaignListingRow, CampaignMemberRow } from './campaign-members.dao';
import type { CampaignMemberPo } from './campaign-members.po';
import type { CampaignPo, NewCampaignPo } from './campaigns.po';

/** One campaign as seen by one member: the row, their membership and everyone in it. */
export type CampaignView = Readonly<{
  campaign: CampaignPo;
  membership: CampaignMemberPo;
  members: readonly CampaignMemberRow[];
}>;

/** The view of the detail modal: the campaign view plus the id of the table's cast, the latest
 *  entry of any member and who has the table open right now. */
export type CampaignDetailView = CampaignView &
  Readonly<{
    castSceneId: string;
    lastAccessAt: Date | null;
    onlineUserIds: ReadonlySet<string>;
  }>;

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
    cover: coverOf(campaign),
    contentWarnings: campaign.contentWarnings.filter(isContentWarning),
    tags: campaign.tags,
    lastEnteredAt: row.lastEnteredAt?.toISOString() ?? null,
  };
}

// The column is plain text[]: a value the contract no longer knows is left out, not sent.
function isContentWarning(warning: string): warning is ContentWarningDto {
  return contentWarningDto.safeParse(warning).success;
}

/** The cover the campaign shows: the image when it has one, else the chosen drawing, else the
 *  drawing of its id (a campaign that never chose looks as it always did).
 *
 *  Example: `coverOf(campaign) // { kind: 'drawn', drawing: 1, tone: 3 }` */
export function coverOf(campaign: CampaignPo): CampaignCoverDto {
  if (campaign.coverAssetId) return { kind: 'image', assetId: campaign.coverAssetId };
  const { coverDrawing: drawing, coverTone: tone } = campaign;
  if (drawing !== null && tone !== null) return { kind: 'drawn', drawing, tone };
  return { kind: 'drawn', ...defaultCoverOf(campaign.id) };
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
    memberCount: membersOfRecord(view.members).length,
  });
}

/** The members the table keeps a record of: everyone but the spectators, who leave no trace in
 *  the participants nor in the count.
 *
 *  Example: `membersOfRecord(view.members).length // the memberCount` */
export function membersOfRecord(members: readonly CampaignMemberRow[]): CampaignMemberRow[] {
  return members.filter((member) => member.role !== 'spectator');
}

/** View → DTO: the detail modal; the join code only reaches the master, the hash never leaves,
 *  and the spectators are not among the participants.
 *
 *  Example: `toCampaignDetailDto(view).joinCode // null for a player` */
export function toCampaignDetailDto(view: CampaignDetailView): CampaignDetailDto {
  const access = toCampaignAccessBo(view.campaign.id, view.membership.userId, view.membership);
  return {
    ...toCampaignSummaryOfView(view),
    members: sortedMembers(membersOfRecord(view.members), view.onlineUserIds),
    joinCode: access.canSeeJoinCode() ? view.campaign.joinCode : null,
    hasPassword: view.campaign.passwordHash !== null,
    castSceneId: view.castSceneId,
    createdAt: view.campaign.createdAt.toISOString(),
    lastAccessAt: view.lastAccessAt?.toISOString() ?? null,
  };
}

/** Detail → what anyone at the table sees of it, without what depends on who reads it (the
 *  payload of `session:campaignUpdated`).
 *
 *  Example: `toCampaignInfoDto(detail).cover` */
export function toCampaignInfoDto(detail: CampaignDetailDto): CampaignInfoDto {
  const { id, name, system, status, description, visibility, masterName, memberCount } = detail;
  const { cover, contentWarnings, tags } = detail;
  return {
    ...{ id, name, system, status, description, visibility, masterName, memberCount },
    ...{ cover, contentWarnings, tags },
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

/** Membership (or its absence) → BO for the settings rules (edit, new code, delete).
 *
 *  Example: `toCampaignSettingsBo(campaignId, userId, membership, true).requireMasterAtTable('delete the campaign')` */
export function toCampaignSettingsBo(
  campaignId: string,
  userId: string,
  membership: CampaignMemberPo | undefined,
  atTable: boolean,
): CampaignSettingsBo {
  return new CampaignSettingsBo(toCampaignAccessBo(campaignId, userId, membership), atTable);
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

/** Who asks to change a role, and of whom: the two memberships (`undefined` = not a member). */
export type MemberRoleLookup = Readonly<{
  campaignId: string;
  userId: string;
  targetId: string;
  requester: CampaignMemberPo | undefined;
  target: CampaignMemberPo | undefined;
}>;

/** Both memberships → BO for the role change rules.
 *
 *  Example: `toMemberRoleBo({ campaignId, userId, targetId, requester, target }).decide('player')` */
export function toMemberRoleBo(lookup: MemberRoleLookup): MemberRoleBo {
  const { campaignId, userId, targetId } = lookup;
  const access = toCampaignAccessBo(campaignId, userId, lookup.requester);
  return new MemberRoleBo(access, { userId: targetId, role: lookup.target?.role ?? null });
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

function sortedMembers(
  members: readonly CampaignMemberRow[],
  onlineUserIds: ReadonlySet<string>,
): CampaignMemberDto[] {
  return orderedMembers(members).map((member) =>
    toCampaignMemberDto(member, onlineUserIds.has(member.userId)),
  );
}

/** Member row → DTO: one participant as the table shows them, with the effective color.
 *
 *  Example: `toCampaignMemberDto(dudaRow, true).role // 'player'` */
export function toCampaignMemberDto(member: CampaignMemberRow, online: boolean): CampaignMemberDto {
  return {
    userId: member.userId,
    name: member.name,
    role: member.role,
    color: memberColorOf(member.userId, member.colorChoice),
    avatarId: member.avatarId,
    online,
  };
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
    ...coverColumnsOf(input.cover),
    ...owned,
  };
}

type CoverColumns = Pick<NewCampaignPo, 'coverDrawing' | 'coverTone' | 'coverAssetId'>;

// One kind at a time: choosing a drawing drops the image and the other way round.
function coverColumnsOf(cover: CampaignCoverDto | undefined): CoverColumns {
  if (!cover) return {};
  if (cover.kind === 'image') {
    return { coverDrawing: null, coverTone: null, coverAssetId: cover.assetId };
  }
  return { coverDrawing: cover.drawing, coverTone: cover.tone, coverAssetId: null };
}

/** Settings DTO → the columns to write; absent fields are left out, so they stay as they are.
 *  `passwordHash`: `undefined` keeps it, `null` removes it.
 *
 *  Example: `toCampaignPatch(input, { passwordHash: undefined, updatedAt: clock.now() })` */
export function toCampaignPatch(
  input: UpdateCampaignRequestDto,
  written: Readonly<{ passwordHash: string | null | undefined; updatedAt: Date }>,
): Partial<NewCampaignPo> {
  // The plain password never reaches the row: only `written.passwordHash` does.
  const { name, system, status, description, visibility, contentWarnings, tags } = input;
  const fields = { name, system, status, description, visibility, contentWarnings, tags };
  const columns = { ...fields, ...coverColumnsOf(input.cover), ...written };
  const present = Object.entries(columns).filter(([, value]) => value !== undefined);
  return Object.fromEntries(present) as Partial<NewCampaignPo>;
}
