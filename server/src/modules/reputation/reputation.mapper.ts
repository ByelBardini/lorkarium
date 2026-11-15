import type { ReputationSummaryDto } from '@lorkarium/contracts';
import type { ReputationSummary } from './reputation.bo';

/** The summary the BO computed, in the card's contract shape.
 *
 *  Example: `toReputationSummaryDto(summarizeReputation(counts, 5)) // { up, down, myVote, percent }` */
export function toReputationSummaryDto(summary: ReputationSummary): ReputationSummaryDto {
  return { up: summary.up, down: summary.down, myVote: summary.myVote, percent: summary.percent };
}
