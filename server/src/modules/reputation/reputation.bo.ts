import type { ReputationVoteValuePo } from './reputation-votes.po';
import { ReputationError } from './reputation.error';

export type ReputationVoteAttempt = Readonly<{
  voterId: string;
  targetId: string;
  /** Whether both sit at some table as master or player (spectator and juggernaut do not count). */
  shareCampaign: boolean;
}>;

export type ReputationCounts = Readonly<{
  up: number;
  down: number;
  myVote: ReputationVoteValuePo | null;
}>;

/** The counts plus the approval percent (`null` below the minimum of votes). */
export type ReputationSummary = ReputationCounts & Readonly<{ percent: number | null }>;

/** Who may vote on whom: only someone who shares a table, so votes from strangers (combined or
 *  in retaliation) never count.
 *
 *  Example: `ReputationVoteBo.requireAllowed({ voterId, targetId, shareCampaign: true })` */
export const ReputationVoteBo = {
  /** Throws `REPUTATION_SELF` or `REPUTATION_NOT_ALLOWED`.
   *
   *  Example: `ReputationVoteBo.requireAllowed({ voterId: a, targetId: a, shareCampaign: true }) // throws` */
  requireAllowed(attempt: ReputationVoteAttempt): void {
    const { voterId, targetId } = attempt;
    if (voterId === targetId) {
      throw new ReputationError('REPUTATION_SELF', `account ${voterId} voted on itself`);
    }
    if (attempt.shareCampaign) return;
    throw new ReputationError(
      'REPUTATION_NOT_ALLOWED',
      `account ${voterId} shares no table with ${targetId}: expected a table where both are master or player`,
    );
  },
};

/** The counts as the card shows them: the approval percent only from `minVotes` on, since one or
 *  two votes would read as 0% or 100%.
 *
 *  Example: `summarizeReputation({ up: 4, down: 1, myVote: null }, 5).percent // 80` */
export function summarizeReputation(counts: ReputationCounts, minVotes: number): ReputationSummary {
  const total = counts.up + counts.down;
  const percent = total < minVotes ? null : Math.round((counts.up / total) * 100);
  return { up: counts.up, down: counts.down, myVote: counts.myVote, percent };
}
