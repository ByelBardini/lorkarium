import { z } from 'zod';

/** Role inside one campaign; unrelated to the global account role. */
export const campaignRoleDto = z.enum(['master', 'player']);

export type CampaignRoleDto = z.infer<typeof campaignRoleDto>;

export const campaignVisibilityDto = z.enum(['public', 'private']);

export type CampaignVisibilityDto = z.infer<typeof campaignVisibilityDto>;

/** One row of the signed-in user's campaign list.
 *
 *  Example: `campaignSummaryDto.parse(body).myRole // 'master'` */
export const campaignSummaryDto = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  system: z.string().nullable(),
  status: z.string().nullable(),
  description: z.string().nullable(),
  visibility: campaignVisibilityDto,
  myRole: campaignRoleDto,
  masterName: z.string(),
  memberCount: z.number().int().positive(),
  lastEnteredAt: z.iso.datetime().nullable(),
});

export type CampaignSummaryDto = z.infer<typeof campaignSummaryDto>;

export const campaignMemberDto = z.strictObject({
  name: z.string(),
  role: campaignRoleDto,
});

export type CampaignMemberDto = z.infer<typeof campaignMemberDto>;

/** The campaign as its detail modal shows it; `joinCode` is `null` for anyone but the master.
 *
 *  Example: `campaignDetailDto.parse(body.campaign).members[0].role // 'master'` */
export const campaignDetailDto = campaignSummaryDto.extend({
  members: z.array(campaignMemberDto),
  joinCode: z.string().nullable(),
  hasPassword: z.boolean(),
});

export type CampaignDetailDto = z.infer<typeof campaignDetailDto>;

/** Response of `GET /api/campaigns`. */
export const listCampaignsResponseDto = z.strictObject({
  campaigns: z.array(campaignSummaryDto),
});

export type ListCampaignsResponseDto = z.infer<typeof listCampaignsResponseDto>;

/** Response of `POST /api/campaigns` and `GET /api/campaigns/:campaignId`. */
export const campaignResponseDto = z.strictObject({ campaign: campaignDetailDto });

export type CampaignResponseDto = z.infer<typeof campaignResponseDto>;

/** Path params of every `/api/campaigns/:campaignId` route. */
export const campaignIdParamsDto = z.strictObject({ campaignId: z.uuid() });

export type CampaignIdParamsDto = z.infer<typeof campaignIdParamsDto>;
