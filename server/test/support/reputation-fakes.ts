import type { ReputationVoteValue } from '@lorkarium/contracts';
import type { ReputationVotesDao } from '../../src/modules/reputation/reputation.service';

type Vote = { voterId: string; targetId: string; value: ReputationVoteValue };

/** Votes and shared tables in memory, behind the DAO the reputation service
 *  uses; `journal` keeps every write in order. */
export class ReputationDaoFake implements ReputationVotesDao {
  readonly votes: Vote[] = [];
  readonly journal: string[] = [];
  /** Pairs (`a|b`, any order) that sit at a table together as master or player. */
  readonly sharedPairs = new Set<string>();

  /** Example: `fake.seatTogether(BIA_ID, CAIO_ID)` */
  seatTogether(oneId: string, otherId: string): void {
    this.sharedPairs.add(`${oneId}|${otherId}`);
    this.sharedPairs.add(`${otherId}|${oneId}`);
  }

  async shareCampaign(oneId: string, otherId: string): Promise<boolean> {
    return this.sharedPairs.has(`${oneId}|${otherId}`);
  }

  async upsertVote(voterId: string, targetId: string, value: ReputationVoteValue): Promise<void> {
    this.journal.push(`upsert ${value}`);
    const kept = this.votes.find((vote) => vote.voterId === voterId && vote.targetId === targetId);
    if (kept) kept.value = value;
    else this.votes.push({ voterId, targetId, value });
  }

  async removeVote(voterId: string, targetId: string): Promise<void> {
    this.journal.push('remove');
    const index = this.votes.findIndex((v) => v.voterId === voterId && v.targetId === targetId);
    if (index >= 0) this.votes.splice(index, 1);
  }

  async countsFor(targetId: string, viewerId: string) {
    const onTarget = this.votes.filter((vote) => vote.targetId === targetId);
    const mine = onTarget.find((vote) => vote.voterId === viewerId);
    return {
      up: onTarget.filter((vote) => vote.value === 1).length,
      down: onTarget.filter((vote) => vote.value === -1).length,
      myVote: mine?.value ?? null,
    };
  }
}

/** The accounts that are active (neither unknown nor suspended), by id. */
export class ActiveAccountsFake {
  constructor(private readonly activeIds: readonly string[]) {}

  async isActive(userId: string): Promise<boolean> {
    return this.activeIds.includes(userId);
  }
}
