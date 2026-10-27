import { z } from 'zod';
import { campaignInfoDto, campaignRoleDto } from './campaign.dto';
import { CAMPAIGN_PASSWORD_MAX_LENGTH } from './create-campaign.dto';

/** One public campaign as anyone signed in sees it in "Explorar mesas": `myRole` is the reader's
 *  role there (`null` = not a member yet), `hasPassword` says whether "Entrar" asks for it, and
 *  `masterOnline`/`playersOnline` say who has the table open right now (players = everyone else).
 *
 *  Example: `publicCampaignDto.parse(row).myRole // null` */
export const publicCampaignDto = campaignInfoDto.extend({
  myRole: campaignRoleDto.nullable(),
  hasPassword: z.boolean(),
  /** The master's @, which the explore search matches exactly. */
  masterUsername: z.string(),
  masterOnline: z.boolean(),
  playersOnline: z.number().int().nonnegative(),
});

export type PublicCampaignDto = z.infer<typeof publicCampaignDto>;

/** Response of `GET /api/campaigns/public`. */
export const listPublicCampaignsResponseDto = z.strictObject({
  campaigns: z.array(publicCampaignDto),
});

export type ListPublicCampaignsResponseDto = z.infer<typeof listPublicCampaignsResponseDto>;

/** Body of `POST /api/campaigns/:campaignId/join`: a public campaign needs no code, only its
 *  password when it has one. The response is the `joinCampaignResponseDto`.
 *
 *  Example: `joinPublicCampaignRequestDto.parse({ password: 'sino' })` */
export const joinPublicCampaignRequestDto = z.strictObject({
  password: z.string().min(1).max(CAMPAIGN_PASSWORD_MAX_LENGTH).optional(),
});

export type JoinPublicCampaignRequestDto = z.infer<typeof joinPublicCampaignRequestDto>;
