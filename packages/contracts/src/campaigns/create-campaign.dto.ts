import { z } from 'zod';
import { campaignVisibilityDto } from './campaign.dto';

export const CAMPAIGN_NAME_MAX_LENGTH = 80;
export const CAMPAIGN_LABEL_MAX_LENGTH = 40;
export const CAMPAIGN_DESCRIPTION_MAX_LENGTH = 500;
export const CAMPAIGN_PASSWORD_MIN_LENGTH = 4;
// Caps the Argon2 input, like the login password.
export const CAMPAIGN_PASSWORD_MAX_LENGTH = 128;

function optionalText(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength)
    .nullish()
    .transform((text) => (text ? text : null));
}

/** Body of `POST /api/campaigns`; empty optional texts become `null`, an empty password is absent.
 *
 *  Example: `createCampaignRequestDto.parse({ name: ' Vharn ' }) // { name: 'Vharn', system: null, …, visibility: 'private' }` */
export const createCampaignRequestDto = z.strictObject({
  name: z.string().trim().min(1).max(CAMPAIGN_NAME_MAX_LENGTH),
  system: optionalText(CAMPAIGN_LABEL_MAX_LENGTH),
  status: optionalText(CAMPAIGN_LABEL_MAX_LENGTH),
  description: optionalText(CAMPAIGN_DESCRIPTION_MAX_LENGTH),
  visibility: campaignVisibilityDto.default('private'),
  password: z.preprocess(
    (password) => (password === '' ? undefined : password),
    z.string().min(CAMPAIGN_PASSWORD_MIN_LENGTH).max(CAMPAIGN_PASSWORD_MAX_LENGTH).optional(),
  ),
});

export type CreateCampaignRequestDto = z.infer<typeof createCampaignRequestDto>;
export type CreateCampaignRequestInput = z.input<typeof createCampaignRequestDto>;
