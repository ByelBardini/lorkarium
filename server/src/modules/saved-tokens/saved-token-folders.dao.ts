import { and, asc, count, eq, type SQL } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import type { SavedTokenOwner } from './saved-tokens.dao';
import {
  savedTokenFolders,
  type NewSavedTokenFolderPo,
  type SavedTokenFolderPo,
} from './saved-tokens.po';

/** The folders of saved tokens of a member at a table, keyed by the table and the owner. */
export class SavedTokenFoldersDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** The owner's folders in the order they were created.
   *
   *  Example: `const folders = await dao.listOf(owner)` */
  async listOf(owner: SavedTokenOwner): Promise<SavedTokenFolderPo[]> {
    return this.db
      .select()
      .from(savedTokenFolders)
      .where(ownedBy(owner))
      .orderBy(asc(savedTokenFolders.createdAt), asc(savedTokenFolders.id));
  }

  /** `undefined` when the folder is not the owner's.
   *
   *  Example: `await dao.findOf(owner, folderId)` */
  async findOf(owner: SavedTokenOwner, folderId: string): Promise<SavedTokenFolderPo | undefined> {
    const [row] = await this.db
      .select()
      .from(savedTokenFolders)
      .where(and(ownedBy(owner), eq(savedTokenFolders.id, folderId)));
    return row;
  }

  /** How many folders the owner keeps at the table.
   *
   *  Example: `await dao.countOf(owner) // 2` */
  async countOf(owner: SavedTokenOwner): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(savedTokenFolders)
      .where(ownedBy(owner));
    return row?.total ?? 0;
  }

  async insert(row: NewSavedTokenFolderPo): Promise<SavedTokenFolderPo> {
    const [inserted] = await this.db.insert(savedTokenFolders).values(row).returning();
    if (!inserted) throw new Error(`insert of saved_token_folders returned no row for ${row.name}`);
    return inserted;
  }

  /** `undefined` when the folder is not the owner's.
   *
   *  Example: `await dao.rename(owner, folderId, { name: 'Mortos', nameKey: 'mortos' })` */
  async rename(
    owner: SavedTokenOwner,
    folderId: string,
    named: Pick<SavedTokenFolderPo, 'name' | 'nameKey'>,
  ): Promise<SavedTokenFolderPo | undefined> {
    const [row] = await this.db
      .update(savedTokenFolders)
      .set(named)
      .where(and(ownedBy(owner), eq(savedTokenFolders.id, folderId)))
      .returning();
    return row;
  }

  /** `false` when the folder is not the owner's; its tokens stay, out of any folder (set null).
   *
   *  Example: `await dao.remove(owner, folderId) // true` */
  async remove(owner: SavedTokenOwner, folderId: string): Promise<boolean> {
    const rows = await this.db
      .delete(savedTokenFolders)
      .where(and(ownedBy(owner), eq(savedTokenFolders.id, folderId)))
      .returning({ id: savedTokenFolders.id });
    return rows.length > 0;
  }
}

function ownedBy(owner: SavedTokenOwner): SQL | undefined {
  return and(
    eq(savedTokenFolders.campaignId, owner.campaignId),
    eq(savedTokenFolders.userId, owner.userId),
  );
}
