import { and, asc, count, eq, sql, type SQL } from 'drizzle-orm';
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
const t = libraryDocumentTabs;
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
  async listOfDocument(campaignId: string, documentId: string): Promise<DocumentTabSummaryPo[]> {
    return this.db
      .select(summaryColumns)
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
