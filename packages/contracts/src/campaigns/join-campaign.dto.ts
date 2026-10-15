import { z } from 'zod';
import { CAMPAIGN_PASSWORD_MAX_LENGTH } from './create-campaign.dto';
import { campaignSummaryDto } from './campaign.dto';

// No 0/O or 1/I: a code read aloud or copied by hand cannot be mistyped between them.
export const CAMPAIGN_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CAMPAIGN_CODE_LENGTH = 8;

const CANONICAL_CODE = new RegExp(`^[${CAMPAIGN_CODE_ALPHABET}]*$`);

/** A campaign join code in canonical form; accepts lowercase, hyphens and spaces.
 *
 *  Example: `campaignCodeDto.parse(' vhrn-7k2q ') // 'VHRN7K2Q'` */
export const campaignCodeDto = z
  .string()
  .transform((code) => code.replace(/[\s-]/g, '').toUpperCase())
  .pipe(z.string().length(CAMPAIGN_CODE_LENGTH).regex(CANONICAL_CODE));

/** Body of `POST /api/campaigns/join`; strict, so a forged `userId` is refused.
 *
 *  Example: `joinCampaignRequestDto.parse({ code: 'vhrn-7k2q' }) // { code: 'VHRN7K2Q' }` */
export const joinCampaignRequestDto = z.strictObject({
  code: campaignCodeDto,
  password: z.string().min(1).max(CAMPAIGN_PASSWORD_MAX_LENGTH).optional(),
});

export type JoinCampaignRequestDto = z.infer<typeof joinCampaignRequestDto>;
export type JoinCampaignRequestInput = z.input<typeof joinCampaignRequestDto>;

/** Response of `POST /api/campaigns/join`: the campaign the user is now a member of. */
export const joinCampaignResponseDto = z.strictObject({ campaign: campaignSummaryDto });

export type JoinCampaignResponseDto = z.infer<typeof joinCampaignResponseDto>;
