import type { CampaignSummaryDto } from '@lorkarium/contracts';
import type { TableSeat } from '@lorkarium/game-core';

/** What a campaign the reader is in tells about their seat (a summary or a detail). */
export type CampaignSeatSource = Pick<CampaignSummaryDto, 'myRole' | 'ownerId' | 'juggernaut'>;

/** The reader's seat at a campaign they are in, for the game-core `table-seats` rules: their
 *  role, whether they created it, whether they are there as a juggernaut.
 *
 *  Example: `hasOwnerPowers(readerSeatOf(campaign, user.id)) // shows "Excluir mesa"` */
export function readerSeatOf(campaign: CampaignSeatSource, readerId: string | null): TableSeat {
  return {
    role: campaign.myRole,
    owner: readerId !== null && campaign.ownerId === readerId,
    juggernaut: campaign.juggernaut,
  };
}
