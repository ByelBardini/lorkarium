import type { DocumentAccessBo } from './document-access.bo';
import { visibleTabsOf, type DocumentTabState } from './document-tabs.bo';
import { DocumentPreviewAssetNotFoundError } from './documents.error';

/** An image associated with one tab of the document, prepared or shown by its body. */
export type DocumentTabImageReference = Readonly<{ tabId: string; assetId: string }>;

/** Which image may become the library cover of a document: none, the current one, or one
 *  already associated with a tab the requester sees (an owner never reaches a masters-only
 *  image through the cover). Whether the requester edits the document is decided before.
 *
 *  Example: `new DocumentPreviewBo(document, tabs, references, row.previewAssetId).requireImage(id)` */
export class DocumentPreviewBo {
  constructor(
    private readonly document: DocumentAccessBo,
    private readonly tabs: readonly DocumentTabState[],
    private readonly references: readonly DocumentTabImageReference[],
    private readonly currentAssetId: string | null,
  ) {}
  requireImage(assetId: string | null): void {
    if (assetId === null || assetId === this.currentAssetId) return;
    const visible = new Set(visibleTabsOf(this.document, this.tabs).map((tab) => tab.id));
    const known = this.references.some(
      (reference) => reference.assetId === assetId && visible.has(reference.tabId),
    );
    if (!known) throw new DocumentPreviewAssetNotFoundError(this.document.idOf(), assetId);
  }
}
