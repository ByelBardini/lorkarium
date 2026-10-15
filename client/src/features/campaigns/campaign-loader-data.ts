import type { CampaignDetailDto } from '@lorkarium/contracts';

/** What the campaign routes (detail modal and table) load. */
export type CampaignLoaderData = Readonly<{ campaign: CampaignDetailDto }>;
