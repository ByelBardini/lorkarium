import type { DrawnCampaignCoverDto } from '@lorkarium/contracts';
import { defaultCoverOf } from '@lorkarium/game-core';

/** The cover a campaign shows before its own is known (a table reopened from what an older tab
 *  stored): the same drawing the server gives a campaign that never chose one.
 *
 *  Example: `fallbackCoverOf(campaign.id) // { kind: 'drawn', drawing: 1, tone: 3 }` */
export function fallbackCoverOf(campaignId: string): DrawnCampaignCoverDto {
  return { kind: 'drawn', ...defaultCoverOf(campaignId) };
}
