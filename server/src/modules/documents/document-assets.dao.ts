import { and, eq, sql, type SQL } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { libraryDocumentAssets, type DocumentAssetPo } from './document-assets.po';

const t = libraryDocumentAssets;
function ofTab(campaignId: string, documentId: string, tabId: string): SQL | undefined {
  return and(eq(t.campaignId, campaignId), eq(t.documentId, documentId), eq(t.tabId, tabId));
}
/** The images associated with each tab of a document, prepared or shown by the saved body.
 *
 *  Example: `await new DocumentAssetsDao(tx).confirmTab(campaignId, documentId, tabId, ids)` */
export class DocumentAssetsDao {
  constructor(private readonly db: DatabaseExecutor) {}
  async ofDocument(campaignId: string, documentId: string): Promise<DocumentAssetPo[]> {
    return this.db
      .select()
      .from(t)
      .where(and(eq(t.campaignId, campaignId), eq(t.documentId, documentId)));
  }
  async ofAsset(campaignId: string, assetId: string): Promise<DocumentAssetPo[]> {
    return this.db
      .select()
      .from(t)
      .where(and(eq(t.campaignId, campaignId), eq(t.assetId, assetId)));
  }
  async prepare(
    campaignId: string,
    documentId: string,
    tabId: string,
    assetId: string,
  ): Promise<void> {
    await this.db
      .insert(t)
      .values({ campaignId, documentId, tabId, assetId })
      .onConflictDoNothing();
  }
  /** The tab shows exactly `assetIds`: those rows become confirmed (inserted when the image came
   *  from another tab) and the rest of the tab falls back to prepared, so undo can bring it back. */
  async confirmTab(
    campaignId: string,
    documentId: string,
    tabId: string,
    assetIds: readonly string[],
  ): Promise<void> {
    await this.db
      .update(t)
      .set({ inContent: false })
      .where(ofTab(campaignId, documentId, tabId));
    if (!assetIds.length) return;
    await this.db
      .insert(t)
      .values(
        assetIds.map((assetId) => ({ campaignId, documentId, tabId, assetId, inContent: true })),
      )
      .onConflictDoUpdate({
        target: [t.campaignId, t.documentId, t.assetId, t.tabId],
        set: { inContent: sql`true` },
      });
  }
}
