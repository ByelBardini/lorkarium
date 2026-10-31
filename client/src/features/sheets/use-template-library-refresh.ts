import { useEffect } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { SceneTabsStore } from '@/stores/scene-tabs-store';
import type { SheetTemplateDraftState } from '@/stores/sheet-template-draft-store';

/** Reads the template again at each `library:changed` of its table: a template saved by another
 *  master shows up when nothing is unsaved, and a deleted one turns `not_found`.
 *
 *  Example: `useTemplateLibraryRefresh(table?.tabs ?? null, entry.draft)` */
export function useTemplateLibraryRefresh(
  tabs: StoreApi<SceneTabsStore> | null,
  draft: StoreApi<SheetTemplateDraftState>,
): void {
  useEffect(
    () =>
      tabs?.subscribe((state, previous) => {
        if (state.libraryRevision !== previous.libraryRevision) void draft.getState().refresh();
      }),
    [tabs, draft],
  );
}
