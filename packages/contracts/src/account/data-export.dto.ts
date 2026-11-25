import { z } from 'zod';
import { sanctionKindDto, sanctionRuleDto, appealOutcomeDto } from '../admin/account-sanction.dto';
import { assetPurposeDto } from '../assets/asset.dto';
import { userRoleDto } from '../auth/auth-user.dto';
import { tokenSideDto } from '../board/token.dto';
import { campaignRoleDto } from '../campaigns/campaign.dto';
import { diceRollPartDto } from '../dice/dice.dto';
import { feedbackContentDto, feedbackPlatformDto } from '../feedback/feedback.dto';
import { userPlanDto } from '../plans/user-plan.dto';
import { userReportReasonDto, userReportStatusDto } from '../profiles/user-report.dto';
import { reputationVoteValueDto } from '../profiles/reputation.dto';

/** One export of the account's data per this many hours: the archive is heavy to build. */
export const DATA_EXPORT_INTERVAL_HOURS = 24;

/** The `code` of `GET /api/account/export` asked again before the interval; the body carries
 *  `retryAfterSeconds` (and the `Retry-After` header), from which the client shows the hour. */
export const DATA_EXPORT_TOO_SOON_CODE = 'EXPORT_TOO_SOON';

/** The version of the layout of `dados.json`; a new one only when a field changes meaning. */
export const DATA_EXPORT_FORMAT_VERSION = 1;

const instant = z.iso.datetime();
const optionalInstant = instant.nullable();
/** A path inside the archive (`imagens/...`); null = the account has no such image. */
const archivePath = z.string().min(1).nullable();
const otherAccount = z.strictObject({ username: z.string(), at: instant });

const exportedAccountDto = z.strictObject({
  id: z.uuid(),
  username: z.string(),
  name: z.string(),
  email: z.string(),
  role: userRoleDto,
  plan: userPlanDto,
  paidPlan: userPlanDto.nullable(),
  paidPlanUntil: optionalInstant,
  createdAt: instant,
  lastSeenAt: optionalInstant,
  passwordChangedAt: optionalInstant,
  termsAcceptedAt: optionalInstant,
  termsVersion: z.string().nullable(),
  twoFactorEnabledAt: optionalInstant,
  suspendedAt: optionalInstant,
  suspendedUntil: optionalInstant,
});

const exportedProfileDto = z.strictObject({
  color: z.string().nullable(),
  bio: z.string().nullable(),
  gameSystems: z.string().nullable(),
  playSchedule: z.string().nullable(),
  contact: z.string().nullable(),
  diceNumberColor: z.string().nullable(),
  rollsCount: z.int().nonnegative(),
  natural20Count: z.int().nonnegative(),
  photo: archivePath,
  banner: archivePath,
  diceTexture: archivePath,
});

const exportedSessionDto = z.strictObject({
  userAgent: z.string().nullable(),
  persistent: z.boolean(),
  createdAt: instant,
  lastSeenAt: instant,
  expiresAt: instant,
});

const exportedVoteDto = z.strictObject({
  username: z.string(),
  value: reputationVoteValueDto,
  createdAt: instant,
  updatedAt: instant,
});

const exportedReputationDto = z.strictObject({
  votesGiven: z.array(exportedVoteDto),
  received: z.strictObject({
    up: z.int().nonnegative(),
    down: z.int().nonnegative(),
    percent: z.int().min(0).max(100).nullable(),
  }),
});

const exportedReportDto = z.strictObject({
  targetUsername: z.string(),
  targetName: z.string(),
  campaignName: z.string().nullable(),
  reason: userReportReasonDto,
  details: z.string().nullable(),
  status: userReportStatusDto,
  createdAt: instant,
  closedAt: optionalInstant,
});

const exportedSanctionDto = z.strictObject({
  kind: sanctionKindDto,
  rule: sanctionRuleDto,
  statement: z.string(),
  until: optionalInstant,
  issuedAt: instant,
  appealReceivedAt: optionalInstant,
  appealOutcome: appealOutcomeDto.nullable(),
  appealNote: z.string().nullable(),
  appealDecidedAt: optionalInstant,
  /** A ban: when the account is deleted unless the appeal holds it. */
  deletionDueAt: optionalInstant,
});

const exportedBadgeDto = z.strictObject({
  name: z.string(),
  description: z.string(),
  grantedAt: instant,
});

const exportedCampaignDto = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  system: z.string().nullable(),
  role: campaignRoleDto,
  owner: z.boolean(),
  joinedAt: instant,
  lastEnteredAt: optionalInstant,
});

const exportedBarDto = z.strictObject({
  label: z.string(),
  current: z.int(),
  max: z.int(),
  temp: z.int(),
});

const exportedCharacterDto = z.strictObject({
  campaignId: z.uuid(),
  name: z.string(),
  initials: z.string(),
  side: tokenSideDto,
  armorClass: z.int().nullable(),
  difficultyClass: z.int().nullable(),
  noteOne: z.string().nullable(),
  noteTwo: z.string().nullable(),
  defeated: z.boolean(),
  bars: z.array(exportedBarDto),
  createdAt: instant,
  updatedAt: instant,
});

const exportedSheetDto = z.strictObject({
  campaignId: z.uuid(),
  name: z.string(),
  template: z.string(),
  values: z.json(),
  createdAt: instant,
  updatedAt: instant,
});

const exportedDocumentDto = z.strictObject({
  campaignId: z.uuid(),
  name: z.string(),
  previewSummary: z.string().nullable(),
  tabs: z.array(z.strictObject({ name: z.string(), content: z.json() })),
  createdAt: instant,
  updatedAt: instant,
});

const exportedSavedRollDto = z.strictObject({
  campaignId: z.uuid(),
  folder: z.string().nullable(),
  name: z.string(),
  parts: z.array(diceRollPartDto),
  createdAt: instant,
  updatedAt: instant,
});

/** A bug report or suggestion still waiting for review (a closed one is no longer kept). */
const exportedFeedbackDto = z.strictObject({
  content: feedbackContentDto,
  platform: feedbackPlatformDto,
  appVersion: z.string(),
  sentAt: instant,
});

const exportedImageDto = z.strictObject({
  path: z.string().min(1),
  campaignId: z.uuid(),
  purpose: assetPurposeDto,
  mimeType: z.string(),
  sizeBytes: z.int().nonnegative(),
  createdAt: instant,
});

/** The `dados.json` of the archive `GET /api/account/export` answers: what the account keeps
 *  about the person, in the order of the account screens. Strict all the way down, so a secret
 *  column (password hash, 2FA secret, recovery code, session token) cannot ride along unnoticed.
 *  The payment data live in the billing service and are exported apart.
 *
 *  Example: `dataExportDto.parse(JSON.parse(text)).account.username // 'bia'` */
export const dataExportDto = z.strictObject({
  format: z.literal('lorkarium-data-export'),
  version: z.literal(DATA_EXPORT_FORMAT_VERSION),
  exportedAt: instant,
  account: exportedAccountDto,
  profile: exportedProfileDto,
  savedColors: z.array(z.strictObject({ color: z.string(), savedAt: instant })),
  /** The account's own emojis; their pictures are in `imagens/emojis/`. */
  customEmojis: z.array(
    z.strictObject({ name: z.string(), animated: z.boolean(), createdAt: instant }),
  ),
  friends: z.array(otherAccount),
  friendRequests: z.strictObject({ sent: z.array(otherAccount), received: z.array(otherAccount) }),
  blocks: z.array(otherAccount),
  reputation: exportedReputationDto,
  reportsMade: z.array(exportedReportDto),
  sanctions: z.array(exportedSanctionDto),
  feedback: z.array(exportedFeedbackDto),
  badges: z.array(exportedBadgeDto),
  campaigns: z.array(exportedCampaignDto),
  characters: z.array(exportedCharacterDto),
  sheets: z.array(exportedSheetDto),
  documents: z.array(exportedDocumentDto),
  savedRolls: z.array(exportedSavedRollDto),
  sessions: z.array(exportedSessionDto),
  images: z.array(exportedImageDto),
});
export type DataExportDto = z.infer<typeof dataExportDto>;
