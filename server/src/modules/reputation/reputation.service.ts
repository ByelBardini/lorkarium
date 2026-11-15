import type { UsersDao } from '../auth/users.dao';
import type { ReputationSummaryDto, ReputationVoteValue } from '@lorkarium/contracts';
import { ReputationVoteBo, summarizeReputation } from './reputation.bo';
import type { ReputationDao } from './reputation.dao';
import { toReputationSummaryDto } from './reputation.mapper';
import { ReputationError } from './reputation.error';

export type ReputationVotesDao = Pick<
  ReputationDao,
  'shareCampaign' | 'upsertVote' | 'removeVote' | 'countsFor'
>;

export type ReputationServiceDeps = Readonly<{
  votes: ReputationVotesDao;
  accounts: Pick<UsersDao, 'isActive'>;
  /** `REPUTATION_MIN_VOTES`, passed in: the BO does not read the contract. */
  minVotes: number;
}>;

/** Votes of the session's account on another one, and the summary a card shows.
 *
 *  Example: `await service.vote(biaId, caioId, 1)` */
export class ReputationService {
  constructor(private readonly deps: ReputationServiceDeps) {}

  /** Example: `await service.vote(biaId, caioId, -1) // replaces Bia's earlier vote` */
  async vote(voterId: string, targetId: string, value: ReputationVoteValue): Promise<void> {
    const { votes } = this.deps;
    await this.requireActiveTarget(targetId);
    const shareCampaign = await votes.shareCampaign(voterId, targetId);
    ReputationVoteBo.requireAllowed({ voterId, targetId, shareCampaign });
    await votes.upsertVote(voterId, targetId, value);
  }

  /** Idempotent, and open to whoever left the shared table since.
   *
   *  Example: `await service.removeVote(biaId, caioId)` */
  async removeVote(voterId: string, targetId: string): Promise<void> {
    await this.requireActiveTarget(targetId);
    await this.deps.votes.removeVote(voterId, targetId);
  }

  /** The reputation of `targetId` as `viewerId` sees it (`myVote` is the viewer's).
   *
   *  Example: `await service.summaryOf(caioId, biaId) // { up, down, myVote, percent }` */
  async summaryOf(targetId: string, viewerId: string): Promise<ReputationSummaryDto> {
    const counts = await this.deps.votes.countsFor(targetId, viewerId);
    return toReputationSummaryDto(summarizeReputation(counts, this.deps.minVotes));
  }

  /** Example: `await service.shareCampaign(biaId, caioId) // true` */
  shareCampaign(oneId: string, otherId: string): Promise<boolean> {
    return this.deps.votes.shareCampaign(oneId, otherId);
  }

  private async requireActiveTarget(targetId: string): Promise<void> {
    if (await this.deps.accounts.isActive(targetId)) return;
    throw new ReputationError(
      'REPUTATION_TARGET_NOT_FOUND',
      `account ${targetId} not found: expected an active account`,
    );
  }
}
