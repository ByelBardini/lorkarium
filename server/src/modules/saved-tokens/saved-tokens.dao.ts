import { and, asc, count, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DatabaseExecutor } from '../../database/transaction';
import {
  savedTokenForms,
  savedTokens,
  type NewSavedTokenPo,
  type SavedTokenChangesPo,
  type SavedTokenFormInputPo,
  type SavedTokenFormPo,
  type SavedTokenPo,
  type SavedTokenRow,
} from './saved-tokens.po';

const older = alias(savedTokens, 'older');

/** The member who owns a saved token: the table and the account, both from the session. */
export type SavedTokenOwner = Readonly<{ campaignId: string; userId: string }>;

/** The saved tokens of a member at a table: every query is keyed by the table and the owner, so
 *  a token of someone else (or of another table) is never read, changed nor deleted. */
export class SavedTokensDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** The owner's saved tokens with their forms, in the order they were created.
   *
   *  Example: `const rows = await dao.listOf({ campaignId: vharnId, userId: biaId })` */
  async listOf(owner: SavedTokenOwner): Promise<SavedTokenRow[]> {
    const rows = await this.db
      .select()
      .from(savedTokens)
      .where(ownedBy(owner))
      .orderBy(asc(savedTokens.createdAt), asc(savedTokens.id));
    return this.withForms(rows);
  }

  /** `undefined` when the saved token is not the owner's.
   *
   *  Example: `await dao.findOf(owner, zombieId)` */
  async findOf(owner: SavedTokenOwner, savedTokenId: string): Promise<SavedTokenRow | undefined> {
    const rows = await this.db
      .select()
      .from(savedTokens)
      .where(and(ownedBy(owner), eq(savedTokens.id, savedTokenId)));
    const [row] = await this.withForms(rows);
    return row;
  }

  /** How many tokens the owner keeps at the table.
   *
   *  Example: `await dao.countOf(owner) // 2` */
  async countOf(owner: SavedTokenOwner): Promise<number> {
    const [row] = await this.db.select({ total: count() }).from(savedTokens).where(ownedBy(owner));
    return row?.total ?? 0;
  }

  /** How many of the owner's tokens were born before `savedTokenId`, by `(created_at, id)` (the
   *  order of `listOf`); `undefined` when the token is not the owner's. Call it in the write's
   *  transaction, after the member's plans are locked.
   *
   *  Example: `await dao.rankOf(owner, zombieId) // 3` */
  async rankOf(owner: SavedTokenOwner, savedTokenId: string): Promise<number | undefined> {
    const bornBefore = sql`(${older.createdAt}, ${older.id}) < (${savedTokens.createdAt}, ${savedTokens.id})`;
    const sameOwner = and(
      eq(older.campaignId, savedTokens.campaignId),
      eq(older.userId, savedTokens.userId),
      bornBefore,
    );
    const [row] = await this.db
      .select({ rank: count(older.id) })
      .from(savedTokens)
      .leftJoin(older, sameOwner)
      .where(and(ownedBy(owner), eq(savedTokens.id, savedTokenId)))
      .groupBy(savedTokens.id);
    return row?.rank;
  }

  /** Inserts the token and its forms (in order); call it on a DAO built with the `tx`.
   *
   *  Example: `await new SavedTokensDao(tx).insert(row, [wolfForm])` */
  async insert(
    row: NewSavedTokenPo,
    forms: readonly SavedTokenFormInputPo[],
  ): Promise<SavedTokenRow> {
    const [inserted] = await this.db.insert(savedTokens).values(row).returning();
    if (!inserted) throw new Error(`insert of saved_tokens returned no row for ${row.name}`);
    return { savedToken: inserted, forms: await this.insertForms(inserted.id, forms) };
  }

  /** Writes only the keys in `changes` and, when `forms` comes, replaces the list; `undefined`
   *  when the token is not the owner's. Call it on a DAO built with the `tx`.
   *
   *  Example: `await new SavedTokensDao(tx).update(owner, zombieId, { name: 'Zumbi 2' })` */
  async update(
    owner: SavedTokenOwner,
    savedTokenId: string,
    changes: SavedTokenChangesPo,
    forms?: readonly SavedTokenFormInputPo[],
  ): Promise<SavedTokenRow | undefined> {
    const [updated] = await this.db
      .update(savedTokens)
      .set({ ...changes, updatedAt: sql`now()` })
      .where(and(ownedBy(owner), eq(savedTokens.id, savedTokenId)))
      .returning();
    if (!updated) return undefined;
    if (forms === undefined) return (await this.withForms([updated]))[0];
    await this.db.delete(savedTokenForms).where(eq(savedTokenForms.savedTokenId, updated.id));
    return { savedToken: updated, forms: await this.insertForms(updated.id, forms) };
  }

  /** `false` when the token is not the owner's (or is already gone); its forms go along.
   *
   *  Example: `await dao.remove(owner, zombieId) // true` */
  async remove(owner: SavedTokenOwner, savedTokenId: string): Promise<boolean> {
    const rows = await this.db
      .delete(savedTokens)
      .where(and(ownedBy(owner), eq(savedTokens.id, savedTokenId)))
      .returning({ id: savedTokens.id });
    return rows.length > 0;
  }

  private async insertForms(
    savedTokenId: string,
    forms: readonly SavedTokenFormInputPo[],
  ): Promise<SavedTokenFormPo[]> {
    if (forms.length === 0) return [];
    const values = forms.map((form, position) => ({ ...form, savedTokenId, position }));
    return this.db.insert(savedTokenForms).values(values).returning();
  }

  private async withForms(rows: SavedTokenPo[]): Promise<SavedTokenRow[]> {
    if (rows.length === 0) return [];
    const forms = await this.db
      .select()
      .from(savedTokenForms)
      .where(
        inArray(
          savedTokenForms.savedTokenId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(savedTokenForms.position));
    return rows.map((savedToken) => ({
      savedToken,
      forms: forms.filter((form) => form.savedTokenId === savedToken.id),
    }));
  }
}

function ownedBy(owner: SavedTokenOwner): SQL | undefined {
  return and(eq(savedTokens.campaignId, owner.campaignId), eq(savedTokens.userId, owner.userId));
}
