import { and, asc, count, eq, type SQL } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import {
  savedRollFolders,
  type NewSavedRollFolderPo,
  type SavedRollFolderPo,
} from './saved-rolls.po';

/** The folders of a member at a table: every query is keyed by the table and the owner, so a
 *  folder of someone else (or of another table) is never read, changed nor deleted. */
export class SavedRollFoldersDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** The owner's folders in the order they were created.
   *
   *  Example: `const folders = await dao.listOf(vharnId, biaId)` */
  async listOf(campaignId: string, userId: string): Promise<SavedRollFolderPo[]> {
    return this.db
      .select()
      .from(savedRollFolders)
      .where(ownedBy(campaignId, userId))
      .orderBy(asc(savedRollFolders.createdAt), asc(savedRollFolders.id));
  }

  /** `undefined` when the folder is not the owner's.
   *
   *  Example: `await dao.findOf(vharnId, biaId, folderId)` */
  async findOf(
    campaignId: string,
    userId: string,
    folderId: string,
  ): Promise<SavedRollFolderPo | undefined> {
    const [row] = await this.db
      .select()
      .from(savedRollFolders)
      .where(and(ownedBy(campaignId, userId), eq(savedRollFolders.id, folderId)));
    return row;
  }

  /** How many folders the owner keeps at the table.
   *
   *  Example: `await dao.countOf(vharnId, biaId) // 2` */
  async countOf(campaignId: string, userId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(savedRollFolders)
      .where(ownedBy(campaignId, userId));
    return row?.total ?? 0;
  }

  async insert(row: NewSavedRollFolderPo): Promise<SavedRollFolderPo> {
    const [inserted] = await this.db.insert(savedRollFolders).values(row).returning();
    if (!inserted) throw new Error(`insert of saved_roll_folders returned no row for ${row.name}`);
    return inserted;
  }

  /** `undefined` when the folder is not the owner's.
   *
   *  Example: `await dao.rename(vharnId, biaId, folderId, { name: 'Magias', nameKey: 'magias' })` */
  async rename(
    campaignId: string,
    userId: string,
    folderId: string,
    named: Pick<SavedRollFolderPo, 'name' | 'nameKey'>,
  ): Promise<SavedRollFolderPo | undefined> {
    const [row] = await this.db
      .update(savedRollFolders)
      .set(named)
      .where(and(ownedBy(campaignId, userId), eq(savedRollFolders.id, folderId)))
      .returning();
    return row;
  }

  /** `false` when the folder is not the owner's; its rolls stay, out of any folder (set null).
   *
   *  Example: `await dao.remove(vharnId, biaId, folderId) // true` */
  async remove(campaignId: string, userId: string, folderId: string): Promise<boolean> {
    const rows = await this.db
      .delete(savedRollFolders)
      .where(and(ownedBy(campaignId, userId), eq(savedRollFolders.id, folderId)))
      .returning({ id: savedRollFolders.id });
    return rows.length > 0;
  }
}

function ownedBy(campaignId: string, userId: string): SQL | undefined {
  return and(eq(savedRollFolders.campaignId, campaignId), eq(savedRollFolders.userId, userId));
}
