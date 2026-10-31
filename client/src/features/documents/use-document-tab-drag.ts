import { useState, type DragEvent } from 'react';
import { movedTabOrder } from '@/lib/tab-order';
import type { DocumentTabCommand } from '@/stores/document-editor-store';

// The type Lorkarium puts on a tab drag; the text one is for browsers that drag only with text.
const DRAG_TYPE = 'application/x-lorkarium-document-tab';

type DragProps = Readonly<Record<string, unknown>>;
export type DocumentTabDrag = Readonly<{ tabProps: (tabId: string, name: string) => DragProps }>;
type DragOptions = Readonly<{
  /** The order the strip shows, the one sent on the drop. */
  order: readonly string[];
  enabled: boolean;
  onReorder: (command: DocumentTabCommand) => unknown;
}>;

/** The native drag and drop of the document tabs (the library's pattern, `use-library-drag.ts`):
 *  a tab dropped on another takes its place.
 *
 *  Example: `const drag = useDocumentTabDrag({ order: ids, enabled: canEdit, onReorder: run })` */
export function useDocumentTabDrag({ order, enabled, onReorder }: DragOptions): DocumentTabDrag {
  const [dragged, setDragged] = useState<string | null>(null);
  const source = (tabId: string, name: string): DragProps => ({
    draggable: true,
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(DRAG_TYPE, tabId);
      event.dataTransfer.setData('text/plain', name);
      setDragged(tabId);
    },
    onDragEnd: () => setDragged(null),
  });
  const target = (tabId: string): DragProps => {
    if (!dragged || dragged === tabId) return {};
    return {
      onDragOver: (event: DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        setDragged(null);
        onReorder({ kind: 'reorder', tabIds: movedTabOrder(order, dragged, tabId) });
      },
    };
  };
  if (!enabled) return { tabProps: () => ({}) };
  return { tabProps: (tabId, name) => ({ ...source(tabId, name), ...target(tabId) }) };
}
