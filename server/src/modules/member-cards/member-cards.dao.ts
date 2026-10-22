import { asc, eq, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { memberCards, type MemberCardChangesPo, type MemberCardPo } from './member-cards.po';

/** The party board cards of a table; a row exists only once someone wrote something on it. */
export class MemberCardsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async listOfCampaign(campaignId: string): Promise<MemberCardPo[]> {
    return this.db
      .select()
      .from(memberCards)
      .where(eq(memberCards.campaignId, campaignId))
      .orderBy(asc(memberCards.userId));
  }

  /** Writes only the keys in `changes` (a patch) and returns the whole row after it.
   *
   *  Example: `await dao.save(vharnId, biaId, { armorClass: 15 })` */
  async save(
    campaignId: string,
    userId: string,
    changes: MemberCardChangesPo,
  ): Promise<MemberCardPo> {
    const [row] = await this.db
      .insert(memberCards)
      .values({ campaignId, userId, ...changes })
      .onConflictDoUpdate({
        target: [memberCards.campaignId, memberCards.userId],
        set: { ...changes, updatedAt: sql`now()` },
      })
      .returning();
    if (!row) throw new Error(`save of member_cards returned no row for ${campaignId}/${userId}`);
    return row;
  }
}
