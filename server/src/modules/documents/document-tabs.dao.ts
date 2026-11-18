import { and, asc, count, eq, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DatabaseExecutor } from '../../database/transaction';
import { updateManySql } from '../../database/update-many';
import {
  libraryDocumentTabs,
  type DocumentTabPo,
  type DocumentTabSummaryPo,
  type NewDocumentTabPo,
} from './document-tabs.po';

export type DocumentTabChangesPo = Partial<Pick<DocumentTabPo, 'name' | 'visibility'>> &
  Readonly<{ updatedAt: Date }>;
export type DocumentTabPositionPo = Readonly<{ id: string; position: number }>;
/** A listed tab with its `rank`: how many tabs of the document were born before it, from 0. */
export type DocumentTabRankedPo = DocumentTabSummaryPo & Readonly<{ rank: number }>;
const t = libraryDocumentTabs;
const older = alias(libraryDocumentTabs, 'older');
const summaryColumns = {
  campaignId: t.campaignId,
  documentId: t.documentId,
  id: t.id,
  name: t.name,
  position: t.position,
  visibility: t.visibility,
  version: t.version,
  updatedAt: t.updatedAt,
};
function ofDocument(campaignId: string, documentId: string): SQL | undefined {
  return and(eq(t.campaignId, campaignId), eq(t.documentId, documentId));
}
function tabIn(campaignId: string, documentId: string, tabId: string): SQL | undefined {
  return and(ofDocument(campaignId, documentId), eq(t.id, tabId));
}
/** The tabs of one document, always addressed through its campaign (spec §2.6).
 *
 *  Example: `await new DocumentTabsDao(tx).listOfDocument(campaignId, documentId)` */
export class DocumentTabsDao {
  constructor(private readonly db: DatabaseExecutor) {}
  /** The summaries by position, each with its rank by `(created_at, id)` in the document. */
  async listOfDocument(campaignId: string, documentId: string): Promise<DocumentTabRankedPo[]> {
    const rank = sql<number>`(row_number() over (order by ${t.createdAt}, ${t.id}) - 1)::int`;
    return this.db
      .select({ ...summaryColumns, rank })
      .from(t)
      .where(ofDocument(campaignId, documentId))
      .orderBy(asc(t.position));
  }
  async findInDocument(
    campaignId: string,
    documentId: string,
    tabId: string,
  ): Promise<DocumentTabPo | undefined> {
    const [row] = await this.db
      .select()
      .from(t)
      .where(tabIn(campaignId, documentId, tabId));
    return row;
  }
  /** Locks the row of one tab for its body save; `false` when it is not in that document.
   *  The body locks its own row, not the table's: a save would otherwise wait on every HP and
   *  condition write of the characters, which hold the table's row. Structural tab changes
   *  still lock the table, and their writes to this row wait here.
   *
   *  Example: `await new DocumentTabsDao(tx).lockById(campaignId, documentId, tabId)` */
  async lockById(campaignId: string, documentId: string, tabId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: t.id })
      .from(t)
      .where(tabIn(campaignId, documentId, tabId))
      .for('no key update');
    return rows.length > 0;
  }
  /** How many tabs of the document were born before `tabId`, by `(created_at, id)`; `undefined`
   *  when the tab is not in that document. Call it in the write's transaction, after its lock.
   *
   *  Example: `await new DocumentTabsDao(tx).rankOf(campaignId, documentId, tabId) // 3` */
  async rankOf(campaignId: string, documentId: string, tabId: string): Promise<number | undefined> {
    const bornBefore = sql`(${older.createdAt}, ${older.id}) < (${t.createdAt}, ${t.id})`;
    const sameDocument = and(
      eq(older.campaignId, t.campaignId),
      eq(older.documentId, t.documentId),
      bornBefore,
    );
    const [row] = await this.db
      .select({ rank: count(older.id) })
      .from(t)
      .leftJoin(older, sameDocument)
      .where(tabIn(campaignId, documentId, tabId))
      .groupBy(t.campaignId, t.id);
    return row?.rank;
  }
  async countOfDocument(campaignId: string, documentId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(t)
      .where(ofDocument(campaignId, documentId));
    return row?.total ?? 0;
  }
  async insert(input: NewDocumentTabPo): Promise<DocumentTabPo> {
    const [saved] = await this.db.insert(t).values(input).returning();
    if (!saved) throw new Error(`Tab for document ${input.documentId} was not inserted`);
    return saved;
  }
  async update(
    campaignId: string,
    documentId: string,
    tabId: string,
    changes: DocumentTabChangesPo,
  ): Promise<DocumentTabSummaryPo> {
    const [saved] = await this.db
      .update(t)
      .set(changes)
      .where(tabIn(campaignId, documentId, tabId))
      .returning(summaryColumns);
    if (!saved) throw new Error(`Tab ${tabId} of document ${documentId} was not updated`);
    return saved;
  }
  async saveContent(
    campaignId: string,
    documentId: string,
    tabId: string,
    change: Readonly<{ content: unknown; updatedAt: Date }>,
  ): Promise<DocumentTabSummaryPo> {
    const [saved] = await this.db
      .update(t)
      .set({ content: change.content, updatedAt: change.updatedAt, version: sql`${t.version} + 1` })
      .where(tabIn(campaignId, documentId, tabId))
      .returning(summaryColumns);
    if (!saved) throw new Error(`Content of tab ${tabId} in document ${documentId} was not saved`);
    return saved;
  }
  async reorder(
    campaignId: string,
    documentId: string,
    order: readonly DocumentTabPositionPo[],
  ): Promise<void> {
    if (!order.length) return;
    await this.db.execute(
      updateManySql({
        table: t,
        key: t.id,
        columns: [{ column: t.position, cast: 'integer' }],
        rows: order.map((tab) => [tab.id, tab.position]),
        where: ofDocument(campaignId, documentId) ?? sql`false`,
      }),
    );
  }
  async delete(campaignId: string, documentId: string, tabId: string): Promise<void> {
    await this.db.delete(t).where(tabIn(campaignId, documentId, tabId));
  }
}
