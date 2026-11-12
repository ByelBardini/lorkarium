import {
  campaignCoverToneDto,
  contentWarningDto,
  isHexColor,
  type CampaignCoverDto,
  type CampaignCoverToneDto,
  type CampaignDetailDto,
  type CampaignInfoDto,
  type CampaignMemberDto,
  type CampaignSummaryDto,
  type ContentWarningDto,
  type PublicCampaignDto,
  type CreateCampaignRequestDto,
  type UpdateCampaignRequestDto,
  type UserPlan,
} from '@lorkarium/contracts';
import { defaultCoverOf, memberColorOf, type TableSeat } from '@lorkarium/game-core';
import type { UserPlanPo } from '../auth/users.po';
import { effectiveLimitsOf } from '../plans/plan-limits.bo';
import { CampaignAccessBo } from './campaign-access.bo';
import { CampaignJoinBo } from './campaign-join.bo';
import { CampaignSettingsBo } from './campaign-settings.bo';
import { JuggernautBo } from './juggernaut.bo';
import { MemberRoleBo } from './member-role.bo';
import type {
  CampaignListingRow,
  CampaignMemberRow,
  PublicCampaignRow,
} from './campaign-members.dao';
import type { CampaignMemberPo } from './campaign-members.po';
import type { CampaignPo, NewCampaignPo } from './campaigns.po';

/** One campaign as seen by one member: the row, their membership and everyone in it. */
export type CampaignView = Readonly<{
  campaign: CampaignPo;
  membership: CampaignMemberPo;
  members: readonly CampaignMemberRow[];
}>;

/** The view of the detail modal: the campaign view plus the latest entry of any member and who
 *  has the table open right now. */
export type CampaignDetailView = CampaignView &
  Readonly<{
    lastAccessAt: Date | null;
    onlineUserIds: ReadonlySet<string>;
  }>;

/** Listing row → DTO: one line of the user's campaign list.
 *
 *  Example: `rows.map(toCampaignSummaryDto)` */
export function toCampaignSummaryDto(row: CampaignListingRow): CampaignSummaryDto {
  return {
    ...campaignInfoOf(row),
    myRole: row.role,
    juggernaut: row.juggernautSince !== null,
    lastEnteredAt: row.lastEnteredAt?.toISOString() ?? null,
  };
}

/** Public row → DTO: one card of "Explorar mesas"; the hash never leaves, only whether "Entrar"
 *  asks for it (never for an admin, who joins without it). "A master is online" is any master of
 *  the table; the players online are everyone else online.
 *
 *  Example: `rows.map((row) => toPublicCampaignDto(row, false, online))[0].hasPassword // true` */
export function toPublicCampaignDto(
  row: PublicCampaignRow,
  readerIsAdmin: boolean,
  onlineUserIds: ReadonlySet<string>,
): PublicCampaignDto {
  const mastersOnline = row.masterIds.filter((id) => onlineUserIds.has(id)).length;
  return {
    ...campaignBaseOf(row),
    myRole: row.myRole,
    hasPassword: row.campaign.passwordHash !== null && !readerIsAdmin,
    masterUsername: row.masterUsername,
    masterOnline: mastersOnline > 0,
    playersOnline: onlineUserIds.size - mastersOnline,
  };
}

type CampaignBaseRow = Readonly<{ campaign: CampaignPo; masterName: string; memberCount: number }>;

function campaignInfoOf(row: CampaignBaseRow & Readonly<{ owner: UserPlanPo }>): CampaignInfoDto {
  return { ...campaignBaseOf(row), limits: effectiveLimitsOf(row.owner) };
}

function campaignBaseOf(row: CampaignBaseRow): Omit<CampaignInfoDto, 'limits'> {
  const { campaign, masterName, memberCount } = row;
  const { id, name, system, status, description, visibility, tags, ownerId } = campaign;
  const { playersCreateTokens, playersDeleteTokens, photoAssetId, bannerAssetId } = campaign;
  return {
    ...{ id, name, system, status, description, visibility, masterName, memberCount, tags },
    ownerId,
    ...{ playersCreateTokens, playersDeleteTokens },
    cover: coverOf(campaign),
    ...{ photoAssetId, bannerAssetId },
    contentWarnings: campaign.contentWarnings.filter(isContentWarning),
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
  if (drawing !== null && tone !== null) {
    return { kind: 'drawn', drawing, tone: coverToneOf(tone) };
  }
  return { kind: 'drawn', ...defaultCoverOf(campaign.id) };
}

// The column holds the digit of a chart tone or a hex: the wire wants the digit back as a number.
function coverToneOf(stored: string): CampaignCoverToneDto {
  const tone = campaignCoverToneDto.safeParse(isHexColor(stored) ? stored : Number(stored));
  if (tone.success) return tone.data;
  throw new Error(`Invalid cover_tone ${JSON.stringify(stored)}: expected 1..4 or #rrggbb`);
}

/** View → DTO: the summary of a campaign assembled from its members instead of the listing query.
 *
 *  Example: `toCampaignSummaryOfView({ campaign, membership, members }).myRole // 'player'` */
export function toCampaignSummaryOfView(view: CampaignView): CampaignSummaryDto {
  const owner = ownerOf(view);
  return toCampaignSummaryDto({
    campaign: view.campaign,
    role: view.membership.role,
    juggernautSince: view.membership.juggernautSince,
    joinedAt: view.membership.joinedAt,
    lastEnteredAt: view.membership.lastEnteredAt,
    masterName: owner.name,
    memberCount: membersOfRecord(view.members).length,
    owner: owner.account,
  });
}

/** The members the table keeps a record of: everyone but the spectators and the juggernauts,
 *  who leave no trace in the participants nor in the count.
 *
 *  Example: `membersOfRecord(view.members).length // the memberCount` */
export function membersOfRecord(members: readonly CampaignMemberRow[]): CampaignMemberRow[] {
  return members.filter((member) => member.role !== 'spectator' && !member.juggernaut);
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
  const { cover, contentWarnings, tags, playersCreateTokens, playersDeleteTokens } = detail;
  const { photoAssetId, bannerAssetId } = detail;
  return {
    ...{ id, name, system, status, description, visibility, masterName, memberCount },
    ownerId: detail.ownerId,
    ...{ cover, photoAssetId, bannerAssetId },
    ...{ contentWarnings, tags, playersCreateTokens, playersDeleteTokens },
    limits: detail.limits,
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

/** Membership (or its absence) and the campaign's owner → where the member sits at the table;
 *  `null` for someone who is not a member.
 *
 *  Example: `toTableSeat(membership, campaign.ownerId) // { role: 'master', owner: true, juggernaut: false }` */
export function toTableSeat(
  membership: CampaignMemberPo | undefined,
  ownerId: string | null,
): TableSeat | null {
  if (!membership) return null;
  const owner = membership.userId === ownerId;
  return { role: membership.role, owner, juggernaut: membership.juggernautSince !== null };
}

/** Campaign + the admin's membership (or its absence) → BO for turning juggernaut mode on/off.
 *
 *  Example: `toJuggernautBo(campaign, rootId, undefined).start()` */
export function toJuggernautBo(
  campaign: CampaignPo,
  userId: string,
  membership: CampaignMemberPo | undefined,
): JuggernautBo {
  const seat = toTableSeat(membership, campaign.ownerId);
  const roleBefore = membership?.roleBeforeJuggernaut ?? null;
  return new JuggernautBo(campaign.id, userId, seat && { ...seat, roleBefore });
}

/** Membership (or its absence) → BO for the settings rules (edit, new code, delete); `ownerId`
 *  tells whether the member holds owner powers (`null` = the campaign is gone).
 *
 *  Example: `toCampaignSettingsBo(campaignId, userId, membership, true, ownerId).requireOwnerPowersAtTable('delete the campaign')` */
export function toCampaignSettingsBo(
  campaignId: string,
  userId: string,
  membership: CampaignMemberPo | undefined,
  atTable: boolean,
  ownerId: string | null,
): CampaignSettingsBo {
  const access = toCampaignAccessBo(campaignId, userId, membership);
  const seat = toTableSeat(membership, ownerId);
  const powers = { owner: seat?.owner ?? false, juggernaut: seat?.juggernaut ?? false };
  return new CampaignSettingsBo(access, atTable, powers);
}

/** Campaign + membership (or its absence) → BO for the join-by-code decision.
 *
 *  Example: `toCampaignJoinBo(campaign, undefined, false).needsPasswordCheck()` */
export function toCampaignJoinBo(
  campaign: CampaignPo,
  membership: CampaignMemberPo | undefined,
  readerIsAdmin: boolean,
): CampaignJoinBo {
  return new CampaignJoinBo({
    campaignId: campaign.id,
    isMember: membership !== undefined,
    hasPassword: campaign.passwordHash !== null,
    isPublic: campaign.visibility === 'public',
    readerIsAdmin,
  });
}

/** Who asks to change a role, and of whom: the two memberships (`undefined` = not a member)
 *  and the campaign's owner (`null` = the campaign is gone). */
export type MemberRoleLookup = Readonly<{
  campaignId: string;
  userId: string;
  targetId: string;
  requester: CampaignMemberPo | undefined;
  target: CampaignMemberPo | undefined;
  ownerId: string | null;
}>;

/** Both memberships → BO for the role change rules, with the seat of each.
 *
 *  Example: `toMemberRoleBo({ campaignId, userId, targetId, requester, target, ownerId }).decide('master')` */
export function toMemberRoleBo(lookup: MemberRoleLookup): MemberRoleBo {
  const { campaignId, userId, targetId, ownerId } = lookup;
  const requester = { userId, seat: toTableSeat(lookup.requester, ownerId) };
  const target = { userId: targetId, seat: toTableSeat(lookup.target, ownerId) };
  return new MemberRoleBo(campaignId, requester, target);
}

// "Mestre: X" is the owner's name, however many co-masters the table has, and the owner's plan
// gives the table's limits.
function ownerOf(view: CampaignView): CampaignMemberRow {
  const { id, ownerId } = view.campaign;
  const owner = view.members.find((member) => member.userId === ownerId);
  if (owner) return owner;
  throw new Error(`campaign ${id} has no member with the owner_id ${ownerId}`);
}

/** The order every member list is shown in: the owner first, then the other masters, then the
 *  rest, each group by name in pt-BR.
 *
 *  Example: `orderedMembers(await dao.listMembers(campaignId))[0].role // 'master'` */
export function orderedMembers(members: readonly CampaignMemberRow[]): CampaignMemberRow[] {
  return [...members].sort(
    (a, b) => seatRank(a) - seatRank(b) || a.name.localeCompare(b.name, 'pt-BR'),
  );
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
    ...accountSealFieldsOf(member.account),
    online,
  };
}

/** What the table picks a person's one seal from: the stored plan (never the effective one, which
 *  is Amigo do Dono's for an admin), the global role and the Dono do Lorkarium.
 *
 *  Example: `accountSealFieldsOf({ role: 'admin', plan: 'free', lorkariumOwner: false }).admin // true` */
export function accountSealFieldsOf(account: UserPlanPo): AccountSealFields {
  const { plan, lorkariumOwner } = account;
  return { plan, admin: account.role === 'admin', lorkariumOwner };
}

/** The fields of a member DTO the seal is picked from. */
export type AccountSealFields = Readonly<{
  plan: UserPlan;
  admin: boolean;
  lorkariumOwner: boolean;
}>;

function seatRank(member: CampaignMemberRow): number {
  if (member.owner) return 0;
  return member.role === 'master' ? 1 : 2;
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
  return { coverDrawing: cover.drawing, coverTone: String(cover.tone), coverAssetId: null };
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
  const { playersCreateTokens, playersDeleteTokens, photoAssetId, bannerAssetId } = input;
  const fields = { name, system, status, description, visibility, contentWarnings, tags };
  const tokenRights = { playersCreateTokens, playersDeleteTokens };
  const images = { photoAssetId, bannerAssetId, ...coverColumnsOf(input.cover) };
  const columns = { ...fields, ...tokenRights, ...images, ...written };
  const present = Object.entries(columns).filter(([, value]) => value !== undefined);
  return Object.fromEntries(present) as Partial<NewCampaignPo>;
}
