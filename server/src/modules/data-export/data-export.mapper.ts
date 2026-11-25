import {
  DATA_EXPORT_FORMAT_VERSION,
  type DataExportDto,
  type DiceRollPartDto,
} from '@lorkarium/contracts';
import type { AssetPo } from '../assets/assets.po';
import type { DataCipherPort } from '../auth/data-cipher.port';
import { avatarKeyOf, bannerKeyOf, diceTextureKeyOf } from '../profiles/profiles.mapper';
import type { CustomEmojiPo } from '../custom-emojis/custom-emoji.po';
import { customEmojiKeyOf } from '../custom-emojis/custom-emojis.mapper';
import type { ReputationSummary } from '../reputation/reputation.bo';
import type { SavedColorPo } from '../saved-colors/saved-colors.po';
import type {
  ExportedAccountRow,
  ExportedSessionRow,
  GivenVoteRow,
  HeldBadgeRow,
  RelatedAccountRow,
} from './account-export.dao';
import type { FeedbackEntryPo } from '../feedback/feedback-entries.po';
import { contentOf } from '../feedback/feedback.mapper';
import type { MadeReportRow, ReceivedSanctionRow } from './moderation-export.dao';
import type {
  MembershipRow,
  OwnBarRow,
  OwnCharacterRow,
  OwnDocumentRow,
  OwnSavedRollRow,
  OwnSheetRow,
  ReadableTabRow,
  SentAssetRow,
} from './campaign-export.dao';

/** Everything the export read about one account, as the DAOs returned it. */
export type DataExportParts = Readonly<{
  account: ExportedAccountRow;
  twoFactorEnabledAt: Date | null;
  sessions: readonly ExportedSessionRow[];
  savedColors: readonly SavedColorPo[];
  customEmojis: readonly CustomEmojiPo[];
  friends: readonly RelatedAccountRow[];
  requestsSent: readonly RelatedAccountRow[];
  requestsReceived: readonly RelatedAccountRow[];
  blocks: readonly RelatedAccountRow[];
  votesGiven: readonly GivenVoteRow[];
  reputationReceived: ReputationSummary;
  reportsMade: readonly MadeReportRow[];
  sanctions: readonly ReceivedSanctionRow[];
  feedbackSent: readonly FeedbackEntryPo[];
  badges: readonly HeldBadgeRow[];
  memberships: readonly MembershipRow[];
  characters: readonly OwnCharacterRow[];
  bars: readonly OwnBarRow[];
  sheets: readonly OwnSheetRow[];
  documents: readonly OwnDocumentRow[];
  tabs: readonly ReadableTabRow[];
  savedRolls: readonly OwnSavedRollRow[];
  assets: readonly SentAssetRow[];
}>;

/** One file of `imagens/` and where its bytes live in the bucket. */
export type ArchiveImage = Readonly<{ path: string; storageKey: string }>;

type JsonValue = DataExportDto['sheets'][number]['values'];

export const PROFILE_IMAGES_FOLDER = 'imagens/perfil';
const CUSTOM_EMOJI_IMAGES_FOLDER = 'imagens/emojis';
const TABLE_IMAGES_FOLDER = 'imagens/mesas';

const EXTENSION_BY_MIME: Readonly<Record<AssetPo['mimeType'], string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'font/woff2': 'woff2',
};

const iso = (at: Date): string => at.toISOString();
const isoOrNull = (at: Date | null): string | null => (at === null ? null : at.toISOString());

/** The photo, banner and dice texture of the account, each under a fixed name (all WebP).
 *
 *  Example: `profileImagesOf(row)[0] // { path: 'imagens/perfil/foto.webp', storageKey: 'avatars/…' }` */
export function profileImagesOf(account: ExportedAccountRow): ArchiveImage[] {
  const images: (ArchiveImage | null)[] = [
    profileImage('foto', account.avatarId, avatarKeyOf),
    profileImage('banner', account.bannerId, bannerKeyOf),
    profileImage('textura-dos-dados', account.diceTextureId, diceTextureKeyOf),
  ];
  return images.filter((image) => image !== null);
}

function profileImage(
  name: string,
  id: string | null,
  keyOf: (id: string) => string,
): ArchiveImage | null {
  const path = profileImagePath(name, id);
  return path === null || id === null ? null : { path, storageKey: keyOf(id) };
}

function profileImagePath(name: string, id: string | null): string | null {
  return id === null ? null : `${PROFILE_IMAGES_FOLDER}/${name}.webp`;
}

/** Each custom emoji under its name (WebP; the moving one when it is a GIF).
 *
 *  Example: `customEmojiImagesOf(rows)[0]?.path // 'imagens/emojis/festa.webp'` */
export function customEmojiImagesOf(rows: readonly CustomEmojiPo[]): ArchiveImage[] {
  return rows.map((row) => ({
    path: `${CUSTOM_EMOJI_IMAGES_FOLDER}/${row.name}.webp`,
    storageKey: customEmojiKeyOf(row.id),
  }));
}

/** An image sent to a table, filed by the table and its own id.
 *
 *  Example: `sentImageOf(asset).path // 'imagens/mesas/<mesa>/<asset>.png'` */
export function sentImageOf(asset: SentAssetRow): ArchiveImage {
  const extension = EXTENSION_BY_MIME[asset.mimeType];
  const path = `${TABLE_IMAGES_FOLDER}/${asset.campaignId}/${asset.id}.${extension}`;
  return { path, storageKey: asset.storageKey };
}

/** PO → DTO: the `dados.json` of the archive. The e-mail is opened here (it rests sealed);
 *  nothing else secret was read to begin with.
 *
 *  Example: `toDataExportDto(parts, cipher, now).account.email // 'bia@mesa.com'` */
export function toDataExportDto(
  parts: DataExportParts,
  cipher: DataCipherPort,
  exportedAt: Date,
): DataExportDto {
  return {
    format: 'lorkarium-data-export',
    version: DATA_EXPORT_FORMAT_VERSION,
    exportedAt: iso(exportedAt),
    account: accountOf(parts, cipher),
    profile: profileOf(parts.account),
    ...relationsOf(parts),
    reputation: reputationOf(parts),
    reportsMade: parts.reportsMade.map(reportOf),
    sanctions: parts.sanctions.map(sanctionOf),
    feedback: parts.feedbackSent.map(feedbackOf),
    badges: parts.badges.map((b) => ({ ...b, grantedAt: iso(b.grantedAt) })),
    ...tablesOf(parts),
    sessions: parts.sessions.map(sessionOf),
    images: parts.assets.map(imageOf),
  };
}

function accountOf(parts: DataExportParts, cipher: DataCipherPort): DataExportDto['account'] {
  const a = parts.account;
  return {
    id: a.id,
    username: a.username,
    name: a.name,
    email: cipher.open('user-email', a.emailCipher, a.id),
    role: a.role,
    plan: a.plan,
    paidPlan: a.paidPlan,
    paidPlanUntil: isoOrNull(a.paidPlanUntil),
    createdAt: iso(a.createdAt),
    lastSeenAt: isoOrNull(a.lastSeenAt),
    passwordChangedAt: isoOrNull(a.passwordChangedAt),
    termsAcceptedAt: isoOrNull(a.termsAcceptedAt),
    termsVersion: a.termsVersion,
    twoFactorEnabledAt: isoOrNull(parts.twoFactorEnabledAt),
    suspendedAt: isoOrNull(a.suspendedAt),
    suspendedUntil: isoOrNull(a.suspendedUntil),
  };
}

function profileOf(a: ExportedAccountRow): DataExportDto['profile'] {
  return {
    color: a.color,
    bio: a.bio,
    gameSystems: a.gameSystems,
    playSchedule: a.playSchedule,
    contact: a.contact,
    diceNumberColor: a.diceNumberColor,
    rollsCount: a.rollsCount,
    natural20Count: a.natural20Count,
    photo: profileImagePath('foto', a.avatarId),
    banner: profileImagePath('banner', a.bannerId),
    diceTexture: profileImagePath('textura-dos-dados', a.diceTextureId),
  };
}

const relatedOf = (row: RelatedAccountRow): { username: string; at: string } => ({
  username: row.username,
  at: iso(row.at),
});

function relationsOf(
  parts: DataExportParts,
): Pick<DataExportDto, 'savedColors' | 'customEmojis' | 'friends' | 'friendRequests' | 'blocks'> {
  return {
    savedColors: parts.savedColors.map((c) => ({ color: c.color, savedAt: iso(c.createdAt) })),
    customEmojis: parts.customEmojis.map((e) => ({
      name: e.name,
      animated: e.animated,
      createdAt: iso(e.createdAt),
    })),
    friends: parts.friends.map(relatedOf),
    friendRequests: {
      sent: parts.requestsSent.map(relatedOf),
      received: parts.requestsReceived.map(relatedOf),
    },
    blocks: parts.blocks.map(relatedOf),
  };
}

function reputationOf(parts: DataExportParts): DataExportDto['reputation'] {
  const { up, down, percent } = parts.reputationReceived;
  const votesGiven = parts.votesGiven.map((vote) => ({
    username: vote.username,
    value: vote.value,
    createdAt: iso(vote.createdAt),
    updatedAt: iso(vote.updatedAt),
  }));
  return { votesGiven, received: { up, down, percent } };
}

function reportOf(row: MadeReportRow): DataExportDto['reportsMade'][number] {
  return {
    targetUsername: row.targetUsername,
    targetName: row.targetName,
    campaignName: row.campaignName,
    reason: row.reason,
    details: row.details,
    status: row.status,
    createdAt: iso(row.createdAt),
    closedAt: isoOrNull(row.resolvedAt),
  };
}

function feedbackOf(row: FeedbackEntryPo): DataExportDto['feedback'][number] {
  const { platform, appVersion } = row;
  return { content: contentOf(row), platform, appVersion, sentAt: iso(row.createdAt) };
}

function sanctionOf(row: ReceivedSanctionRow): DataExportDto['sanctions'][number] {
  return {
    kind: row.kind,
    rule: row.rule,
    statement: row.statement,
    until: isoOrNull(row.until),
    issuedAt: iso(row.issuedAt),
    appealReceivedAt: isoOrNull(row.appealReceivedAt),
    appealOutcome: row.appealOutcome,
    appealNote: row.appealNote,
    appealDecidedAt: isoOrNull(row.appealDecidedAt),
    deletionDueAt: isoOrNull(row.deletionDueAt),
  };
}

function tablesOf(
  parts: DataExportParts,
): Pick<DataExportDto, 'campaigns' | 'characters' | 'sheets' | 'documents' | 'savedRolls'> {
  return {
    campaigns: parts.memberships.map(campaignOf),
    characters: parts.characters.map((row) => characterOf(row, parts.bars)),
    sheets: parts.sheets.map(sheetOf),
    documents: parts.documents.map((row) => documentOf(row, parts.tabs)),
    savedRolls: parts.savedRolls.map(savedRollOf),
  };
}

function campaignOf(row: MembershipRow): DataExportDto['campaigns'][number] {
  return {
    id: row.campaignId,
    name: row.name,
    system: row.system,
    role: row.role,
    owner: row.owner,
    joinedAt: iso(row.joinedAt),
    lastEnteredAt: isoOrNull(row.lastEnteredAt),
  };
}

function characterOf(
  row: OwnCharacterRow,
  bars: readonly OwnBarRow[],
): DataExportDto['characters'][number] {
  const { id, createdAt, updatedAt, ...card } = row;
  const ownBars = bars
    .filter((bar) => bar.characterId === id)
    .map(({ label, current, max, temp }) => ({ label, current, max, temp }));
  return { ...card, bars: ownBars, createdAt: iso(createdAt), updatedAt: iso(updatedAt) };
}

function sheetOf(row: OwnSheetRow): DataExportDto['sheets'][number] {
  return {
    campaignId: row.campaignId,
    name: row.name,
    template: row.template,
    values: row.values,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function documentOf(
  row: OwnDocumentRow,
  tabs: readonly ReadableTabRow[],
): DataExportDto['documents'][number] {
  const ownTabs = tabs
    .filter((tab) => tab.documentId === row.id)
    // JSONB comes back as parsed JSON: the cast only names what the column always holds.
    .map((tab) => ({ name: tab.name, content: tab.content as JsonValue }));
  return {
    campaignId: row.campaignId,
    name: row.name,
    previewSummary: row.previewSummary,
    tabs: ownTabs,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function savedRollOf(row: OwnSavedRollRow): DataExportDto['savedRolls'][number] {
  const parts: DiceRollPartDto[] = row.parts.map((part) => ({ ...part }));
  return {
    campaignId: row.campaignId,
    folder: row.folder,
    name: row.name,
    parts,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function sessionOf(row: ExportedSessionRow): DataExportDto['sessions'][number] {
  return {
    userAgent: row.userAgent,
    persistent: row.persistent,
    createdAt: iso(row.createdAt),
    lastSeenAt: iso(row.lastSeenAt),
    expiresAt: iso(row.expiresAt),
  };
}

function imageOf(row: SentAssetRow): DataExportDto['images'][number] {
  return {
    path: sentImageOf(row).path,
    campaignId: row.campaignId,
    purpose: row.purpose,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    createdAt: iso(row.createdAt),
  };
}
