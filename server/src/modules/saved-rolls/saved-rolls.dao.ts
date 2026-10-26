import { and, asc, count, eq, sql, type SQL } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { campaignMembers } from '../campaigns/campaign-members.po';
import {
  savedRolls,
  type NewSavedRollPo,
  type SavedRollChangesPo,
  type SavedRollPo,
} from './saved-rolls.po';

/** The saved rolls of a member at a table: every query is keyed by the table and the owner, so a
 *  roll of someone else (or of another table) is never read, changed nor deleted. */
export class SavedRollsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** The owner's rolls in the order they were created.
   *
   *  Example: `const rolls = await dao.listOf(vharnId, biaId)` */
  async listOf(campaignId: string, userId: string): Promise<SavedRollPo[]> {
    return this.db
      .select()
      .from(savedRolls)
      .where(ownedBy(campaignId, userId))
      .orderBy(asc(savedRolls.createdAt), asc(savedRolls.id));
  }

  /** How many rolls the owner keeps at the table.
   *
   *  Example: `await dao.countOf(vharnId, biaId) // 2` */
  async countOf(campaignId: string, userId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(savedRolls)
      .where(ownedBy(campaignId, userId));
    return row?.total ?? 0;
  }

  /** Locks the owner's membership until the transaction ends, so two saves of the same member
   *  count one after the other; `false` when the member is gone. `NO KEY UPDATE`: rows that only
   *  point at the membership are still inserted meanwhile. Call it on a DAO built with the `tx`.
   *
   *  Example: `if (!(await rolls.lockOwner(vharnId, biaId))) throw new CampaignNotFoundError(…)` */
  async lockOwner(campaignId: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ userId: campaignMembers.userId })
      .from(campaignMembers)
      .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)))
      .for('no key update');
    return rows.length > 0;
  }

  async insert(row: NewSavedRollPo): Promise<SavedRollPo> {
    const [inserted] = await this.db.insert(savedRolls).values(row).returning();
    if (!inserted) throw new Error(`insert of saved_rolls returned no row for ${row.name}`);
    return inserted;
  }

  /** Writes only the keys in `changes`; `undefined` when the roll is not the owner's.
   *
   *  Example: `await dao.update(vharnId, biaId, rollId, { parts })` */
  async update(
    campaignId: string,
    userId: string,
    savedRollId: string,
    changes: SavedRollChangesPo,
  ): Promise<SavedRollPo | undefined> {
    const [row] = await this.db
      .update(savedRolls)
      .set({ ...changes, updatedAt: sql`now()` })
      .where(and(ownedBy(campaignId, userId), eq(savedRolls.id, savedRollId)))
      .returning();
    return row;
  }

  /** `false` when the roll is not the owner's (or is already gone).
   *
   *  Example: `await dao.remove(vharnId, biaId, rollId) // true` */
  async remove(campaignId: string, userId: string, savedRollId: string): Promise<boolean> {
    const rows = await this.db
      .delete(savedRolls)
      .where(and(ownedBy(campaignId, userId), eq(savedRolls.id, savedRollId)))
      .returning({ id: savedRolls.id });
    return rows.length > 0;
  }
}

function ownedBy(campaignId: string, userId: string): SQL | undefined {
  return and(eq(savedRolls.campaignId, campaignId), eq(savedRolls.userId, userId));
}
