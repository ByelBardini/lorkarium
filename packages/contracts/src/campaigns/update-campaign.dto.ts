import { z } from 'zod';
import { campaignStatusDto, campaignVisibilityDto, contentWarningsDto } from './campaign.dto';
import { campaignCoverDto } from './campaign-cover.dto';
import { campaignTagsDto } from './campaign-tags.dto';
import {
  CAMPAIGN_DESCRIPTION_MAX_LENGTH,
  CAMPAIGN_LABEL_MAX_LENGTH,
  campaignNameDto,
  campaignPasswordDto,
} from './create-campaign.dto';

/** A text the master may keep (absent), clear (`null` or blank) or replace. */
function clearableCampaignText(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength)
    .nullable()
    .optional()
    .transform((text) => (text === undefined ? undefined : text || null));
}

/** Body of `PATCH /api/campaigns/:campaignId` (master only): every field optional, at least one.
 *  `password`: absent keeps it, `null` removes it, a text replaces it.
 *
 *  Example: `updateCampaignRequestDto.parse({ name: 'Vharn', password: null })` */
export const updateCampaignRequestDto = z
  .strictObject({
    name: campaignNameDto.optional(),
    system: clearableCampaignText(CAMPAIGN_LABEL_MAX_LENGTH),
    status: campaignStatusDto.optional(),
    description: clearableCampaignText(CAMPAIGN_DESCRIPTION_MAX_LENGTH),
    visibility: campaignVisibilityDto.optional(),
    contentWarnings: contentWarningsDto.optional(),
    tags: campaignTagsDto.optional(),
    cover: campaignCoverDto.optional(),
    password: campaignPasswordDto.nullable().optional(),
    playersCreateTokens: z.boolean().optional(),
    playersDeleteTokens: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Expected at least one campaign field to change, received an empty body',
  });

export type UpdateCampaignRequestDto = z.infer<typeof updateCampaignRequestDto>;
export type UpdateCampaignRequestInput = z.input<typeof updateCampaignRequestDto>;
