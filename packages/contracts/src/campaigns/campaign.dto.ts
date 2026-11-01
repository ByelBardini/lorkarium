import { z } from 'zod';
import { memberColorDto } from '../account/username.dto';
import { campaignCoverDto } from './campaign-cover.dto';
import { campaignTagsDto } from './campaign-tags.dto';

/** Role inside one campaign; unrelated to the global account role. */
export const campaignRoleDto = z.enum(['master', 'player', 'spectator']);

export type CampaignRoleDto = z.infer<typeof campaignRoleDto>;

export const campaignVisibilityDto = z.enum(['public', 'private']);

export type CampaignVisibilityDto = z.infer<typeof campaignVisibilityDto>;

/** Where the campaign stands; the pt-BR label and the dot color live in the client. */
export const campaignStatusDto = z.enum(['building', 'recruiting', 'ongoing', 'finished']);

export type CampaignStatusDto = z.infer<typeof campaignStatusDto>;

/** A fixed content warning, comparable and highlighted apart from the free tags. */
export const contentWarningDto = z.enum([
  'adult',
  'violence',
  'horror',
  'gore',
  'strong-language',
  'sensitive-themes',
]);

export type ContentWarningDto = z.infer<typeof contentWarningDto>;

/** The content warnings of a campaign, each once, in the order they came.
 *
 *  Example: `contentWarningsDto.parse(['gore', 'gore']) // ['gore']` */
export const contentWarningsDto = z
  .array(contentWarningDto)
  .transform((warnings) => [...new Set(warnings)]);

/** The campaign as anyone in it sees it, without what depends on who reads it; the payload of
 *  `session:campaignUpdated`. `ownerId` is the creator, the one fixed master (`masterName` is
 *  theirs); co-masters are other `master` members. `playersCreateTokens`/`playersDeleteTokens` are the table settings
 *  that open creating, editing and deleting their own tokens to players (game-core `token-rights`). */
export const campaignInfoDto = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  system: z.string().nullable(),
  status: campaignStatusDto,
  description: z.string().nullable(),
  visibility: campaignVisibilityDto,
  ownerId: z.uuid(),
  masterName: z.string(),
  memberCount: z.number().int().positive(),
  cover: campaignCoverDto,
  contentWarnings: contentWarningsDto,
  tags: campaignTagsDto,
  playersCreateTokens: z.boolean(),
  playersDeleteTokens: z.boolean(),
});

export type CampaignInfoDto = z.infer<typeof campaignInfoDto>;

/** One row of the signed-in user's campaign list. `juggernaut` says the reader is an admin in
 *  juggernaut mode there (then `myRole` is `master`).
 *
 *  Example: `campaignSummaryDto.parse(body).myRole // 'master'` */
export const campaignSummaryDto = campaignInfoDto.extend({
  myRole: campaignRoleDto,
  juggernaut: z.boolean(),
  lastEnteredAt: z.iso.datetime().nullable(),
});

export type CampaignSummaryDto = z.infer<typeof campaignSummaryDto>;

/** A participant in the detail modal: the nickname, the effective color, the photo and whether
 *  they have the campaign open right now. */
export const campaignMemberDto = z.strictObject({
  userId: z.uuid(),
  name: z.string(),
  role: campaignRoleDto,
  color: memberColorDto,
  avatarId: z.uuid().nullable(),
  online: z.boolean(),
});

export type CampaignMemberDto = z.infer<typeof campaignMemberDto>;

/** The campaign as its detail modal shows it; `joinCode` is `null` for anyone but the master.
 *  `lastAccessAt` is the latest entry of any member (`null` = nobody entered yet).
 *
 *  Example: `campaignDetailDto.parse(body.campaign).members[0].role // 'master'` */
export const campaignDetailDto = campaignSummaryDto.extend({
  members: z.array(campaignMemberDto),
  joinCode: z.string().nullable(),
  hasPassword: z.boolean(),
  createdAt: z.iso.datetime(),
  lastAccessAt: z.iso.datetime().nullable(),
});

export type CampaignDetailDto = z.infer<typeof campaignDetailDto>;

/** Response of `GET /api/campaigns`. */
export const listCampaignsResponseDto = z.strictObject({
  campaigns: z.array(campaignSummaryDto),
});

export type ListCampaignsResponseDto = z.infer<typeof listCampaignsResponseDto>;

/** Response of `POST /api/campaigns`, `GET`/`PATCH /api/campaigns/:campaignId` and
 *  `POST /api/campaigns/:campaignId/join-code`. */
export const campaignResponseDto = z.strictObject({ campaign: campaignDetailDto });

export type CampaignResponseDto = z.infer<typeof campaignResponseDto>;

/** Path params of every `/api/campaigns/:campaignId` route. */
export const campaignIdParamsDto = z.strictObject({ campaignId: z.uuid() });

export type CampaignIdParamsDto = z.infer<typeof campaignIdParamsDto>;
