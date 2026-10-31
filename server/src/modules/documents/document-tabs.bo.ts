import type { DocumentAccessBo } from './document-access.bo';
import {
  DocumentTabLastError,
  DocumentTabLimitError,
  DocumentTabNotFoundError,
} from './documents.error';

export const FIRST_DOCUMENT_TAB_NAME = 'Geral';
export type DocumentTabState = Readonly<{
  id: string;
  position: number;
  visibility: 'document' | 'masters';
}>;
export type DocumentTabPosition = Readonly<{ id: string; position: number }>;

/** The tabs `document` lets its reader see: a masters-only tab exists only for the masters.
 *
 *  Example: `visibleTabsOf(new DocumentAccessBo(access, row), tabs) // without "Segredos"` */
export function visibleTabsOf<T extends DocumentTabState>(
  document: DocumentAccessBo,
  tabs: readonly T[],
): T[] {
  const sorted = byPosition(tabs);
  if (document.canManage()) return sorted;
  return sorted.filter((tab) => tab.visibility === 'document');
}

function byPosition<T extends DocumentTabState>(tabs: readonly T[]): T[] {
  return [...tabs].sort((left, right) => left.position - right.position);
}

/** Who sees, creates, renames, reorders, hides and deletes each tab of one document; a tab the
 *  reader cannot see is always DOCUMENT_TAB_NOT_FOUND, never FORBIDDEN.
 *
 *  Example: `new DocumentTabsBo(document, tabs, 200).requireCreate() // next position` */
export class DocumentTabsBo<T extends DocumentTabState> {
  constructor(
    private readonly document: DocumentAccessBo,
    private readonly tabs: readonly T[],
    private readonly limit: number,
  ) {}
  visibleTo(): T[] {
    this.document.requireRead();
    return visibleTabsOf(this.document, this.tabs);
  }
  requireVisible(tabId: string): T {
    const found = this.visibleTo().find((tab) => tab.id === tabId);
    if (!found) throw new DocumentTabNotFoundError(this.document.idOf(), tabId);
    return found;
  }
  requireEdit(tabId: string): T {
    const found = this.requireVisible(tabId);
    this.document.requireEdit();
    return found;
  }
  requireVisibilityChange(tabId: string): T {
    const found = this.requireVisible(tabId);
    this.document.requireManage();
    return found;
  }
  /** The position of the new tab, after the highest one. */
  requireCreate(): number {
    this.document.requireEdit();
    const wouldHave = this.tabs.length + 1;
    if (wouldHave > this.limit)
      throw new DocumentTabLimitError(this.document.idOf(), wouldHave, this.limit);
    return Math.max(-1, ...this.tabs.map((tab) => tab.position)) + 1;
  }
  requireDelete(tabId: string): T {
    const found = this.requireEdit(tabId);
    if (this.tabs.length <= 1) throw new DocumentTabLastError(this.document.idOf(), tabId);
    return found;
  }
  /** Every tab with its new position: the slots of the reordered tabs take `visibleOrder` in
   *  sequence, and a tab the reader cannot see (or left out) stays in its slot. */
  mergedOrder(visibleOrder: readonly string[]): DocumentTabPosition[] {
    this.document.requireEdit();
    const visible = new Set(this.visibleTo().map((tab) => tab.id));
    for (const tabId of visibleOrder)
      if (!visible.has(tabId)) throw new DocumentTabNotFoundError(this.document.idOf(), tabId);
    const moving = new Set(visibleOrder);
    const queue = [...visibleOrder];
    return byPosition(this.tabs).map((tab, position) => ({
      id: moving.has(tab.id) ? (queue.shift() ?? tab.id) : tab.id,
      position,
    }));
  }
}
