import { z } from 'zod';
import { campaignStatusDto, campaignVisibilityDto } from './campaign.dto';
import { drawnCampaignCoverDto } from './campaign-cover.dto';

export const CAMPAIGN_NAME_MAX_LENGTH = 80;
export const CAMPAIGN_LABEL_MAX_LENGTH = 40;
export const CAMPAIGN_DESCRIPTION_MAX_LENGTH = 500;
export const CAMPAIGN_PASSWORD_MIN_LENGTH = 4;
// Caps the Argon2 input, like the login password.
export const CAMPAIGN_PASSWORD_MAX_LENGTH = 128;

/** A trimmed optional text; empty, blank or absent becomes `null`. */
export function optionalCampaignText(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength)
    .nullish()
    .transform((text) => (text ? text : null));
}

export const campaignNameDto = z.string().trim().min(1).max(CAMPAIGN_NAME_MAX_LENGTH);

export const campaignPasswordDto = z
  .string()
  .min(CAMPAIGN_PASSWORD_MIN_LENGTH)
  .max(CAMPAIGN_PASSWORD_MAX_LENGTH);

/** Body of `POST /api/campaigns`; empty optional texts become `null`, an empty password is absent.
 *  The cover can only be drawn here: an image needs the campaign to exist first.
 *
 *  Example: `createCampaignRequestDto.parse({ name: ' Vharn ' }) // { name: 'Vharn', system: null, …, status: 'building', visibility: 'private' }` */
export const createCampaignRequestDto = z.strictObject({
  name: campaignNameDto,
  system: optionalCampaignText(CAMPAIGN_LABEL_MAX_LENGTH),
  status: campaignStatusDto.default('building'),
  description: optionalCampaignText(CAMPAIGN_DESCRIPTION_MAX_LENGTH),
  visibility: campaignVisibilityDto.default('private'),
  cover: drawnCampaignCoverDto.optional(),
  password: z.preprocess(
    (password) => (password === '' ? undefined : password),
    campaignPasswordDto.optional(),
  ),
});

export type CreateCampaignRequestDto = z.infer<typeof createCampaignRequestDto>;
export type CreateCampaignRequestInput = z.input<typeof createCampaignRequestDto>;
