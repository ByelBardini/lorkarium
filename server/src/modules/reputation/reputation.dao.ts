import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { DatabaseExecutor } from '../../database/transaction';
import { campaignMembers } from '../campaigns/campaign-members.po';
import type { ReputationCounts } from './reputation.bo';
import { reputationVotes, type ReputationVoteValuePo } from './reputation-votes.po';

// Spectators and juggernauts watch a table without playing it: they never "share" one.
const PLAYING_ROLES = ['master', 'player'] as const;

/** The votes between accounts and whether a pair shares a table. Also read by the profile card.
 *
 *  Example: `await new ReputationDao(db).countsFor(caioId, biaId) // { up: 3, down: 1, myVote: 1 }` */
export class ReputationDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** Whether both accounts sit at the same table as master or player, juggernaut mode excluded.
   *
   *  Example: `await reputation.shareCampaign(biaId, caioId) // true at Vharn` */
  async shareCampaign(oneId: string, otherId: string): Promise<boolean> {
    const other = alias(campaignMembers, 'other_member');
    const [row] = await this.db
      .select({ campaignId: campaignMembers.campaignId })
      .from(campaignMembers)
      .innerJoin(other, eq(other.campaignId, campaignMembers.campaignId))
      .where(and(playingSeatOf(campaignMembers, oneId), playingSeatOf(other, otherId)))
      .limit(1);
    return row !== undefined;
  }

  /** Inserts the vote, or changes the value of the pair's vote.
   *
   *  Example: `await reputation.upsertVote(biaId, caioId, -1)` */
  async upsertVote(voterId: string, targetId: string, value: ReputationVoteValuePo): Promise<void> {
    await this.db
      .insert(reputationVotes)
      .values({ voterId, targetId, value })
      .onConflictDoUpdate({
        target: [reputationVotes.voterId, reputationVotes.targetId],
        set: { value, updatedAt: sql`now()` },
      });
  }

  /** A pair without a vote changes nothing.
   *
   *  Example: `await reputation.removeVote(biaId, caioId)` */
  async removeVote(voterId: string, targetId: string): Promise<void> {
    await this.db
      .delete(reputationVotes)
      .where(and(eq(reputationVotes.voterId, voterId), eq(reputationVotes.targetId, targetId)));
  }

  /** Thumbs up and down on `targetId` and the vote `viewerId` gave, in one query.
   *
   *  Example: `await reputation.countsFor(caioId, biaId) // { up: 1, down: 0, myVote: 1 }` */
  async countsFor(targetId: string, viewerId: string): Promise<ReputationCounts> {
    const [row] = await this.db
      .select({
        up: sql<number>`count(*) filter (where ${reputationVotes.value} = 1)::int`,
        down: sql<number>`count(*) filter (where ${reputationVotes.value} = -1)::int`,
        myVote: sql<ReputationVoteValuePo | null>`max(${reputationVotes.value}) filter (where ${reputationVotes.voterId} = ${viewerId})`,
      })
      .from(reputationVotes)
      .where(eq(reputationVotes.targetId, targetId));
    return { up: row?.up ?? 0, down: row?.down ?? 0, myVote: row?.myVote ?? null };
  }
}

export type SeatColumns = Readonly<Record<'userId' | 'role' | 'juggernautSince', AnyPgColumn>>;

/** A seat that plays the table: master or player, juggernaut mode excluded (the card counts it too).
 *
 *  Example: `where(playingSeatOf(campaignMembers, biaId))` */
export function playingSeatOf(seat: SeatColumns, userId: string): SQL | undefined {
  return and(
    eq(seat.userId, userId),
    inArray(seat.role, [...PLAYING_ROLES]),
    isNull(seat.juggernautSince),
  );
}
