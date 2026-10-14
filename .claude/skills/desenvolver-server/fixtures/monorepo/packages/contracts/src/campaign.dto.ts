import { z } from 'zod';

export const renameCampaignDto = z.strictObject({ campaignId: z.string(), name: z.string().min(1) });
export type RenameCampaignDto = z.infer<typeof renameCampaignDto>;

export const campaignDto = z.strictObject({ id: z.string(), name: z.string() });
export type CampaignDto = z.infer<typeof campaignDto>;
