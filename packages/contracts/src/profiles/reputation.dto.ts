import { z } from 'zod';

/** Below this many votes the card shows "Sem votos suficientes" instead of a percent: one or two
 *  votes would read as 0% or 100%. */
export const REPUTATION_MIN_VOTES = 5;

/** One vote: thumbs up (`1`) or down (`-1`); there is no neutral vote, removing is `DELETE`. */
export const reputationVoteValueDto = z.union([z.literal(1), z.literal(-1)], {
  error: (issue) => `reputation vote ${JSON.stringify(issue.input)}: expected 1 or -1`,
});
export type ReputationVoteValue = z.infer<typeof reputationVoteValueDto>;

/** Body of `PUT /api/users/:userId/reputation`; the voter comes from the session (strict).
 *
 *  Example: `reputationVoteDto.parse({ value: -1 }).value // -1` */
export const reputationVoteDto = z.strictObject({ value: reputationVoteValueDto });
export type ReputationVoteDto = z.infer<typeof reputationVoteDto>;

/** The reputation on a card: counts, the reader's own vote (`null` = none) and the approval
 *  percent, `null` below `REPUTATION_MIN_VOTES`.
 *
 *  Example: `reputationSummaryDto.parse({ up: 1, down: 0, myVote: null, percent: null })` */
export const reputationSummaryDto = z.strictObject({
  up: z.int().nonnegative(),
  down: z.int().nonnegative(),
  myVote: reputationVoteValueDto.nullable(),
  percent: z.int().min(0).max(100).nullable(),
});
export type ReputationSummaryDto = z.infer<typeof reputationSummaryDto>;
