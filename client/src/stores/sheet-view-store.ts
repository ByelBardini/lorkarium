import type { SheetViewDto } from '@lorkarium/contracts';
import { createStore, type StoreApi } from 'zustand/vanilla';

/** The view state of one sheet for who looks at it (`lorkarium.view`): read by the bridge when a
 *  frame connects, written by its `view.set`. `null` = none. */
export type SheetViewSlot = Readonly<{
  current: () => SheetViewDto | null;
  remember: (view: SheetViewDto | null) => void;
}>;

/** The view states of the sheets opened in this page, by table and sheet. Only in memory: the
 *  frame remounts on every tab/window move, the page keeps them; reloading the app forgets them,
 *  and they never reach the server (they are who looks's, not the sheet's). */
export type SheetViewStore = Readonly<{
  views: Readonly<Record<string, SheetViewDto>>;
  remember: (campaignId: string, sheetId: string, view: SheetViewDto | null) => void;
  /** The session ended: another account in this page starts with none. */
  clear: () => void;
}>;

function viewKeyOf(campaignId: string, sheetId: string): string {
  return `${campaignId}:${sheetId}`;
}

/** Example: `const sheetViews = createSheetViewStore()` (one per page, in `AppDependencies`) */
export function createSheetViewStore(): StoreApi<SheetViewStore> {
  return createStore<SheetViewStore>()((set) => ({
    views: {},
    remember: (campaignId, sheetId, view) =>
      set((state) => {
        const key = viewKeyOf(campaignId, sheetId);
        const others = Object.fromEntries(
          Object.entries(state.views).filter(([kept]) => kept !== key),
        );
        return { views: view === null ? others : { ...others, [key]: view } };
      }),
    clear: () => set({ views: {} }),
  }));
}

/** The slot of one sheet of one table: the same pair always reads what the last one kept.
 *
 *  Example: `createSheetBridgeHost({ ..., view: sheetViewSlotOf(sheetViews, campaignId, sheetId) })` */
export function sheetViewSlotOf(
  store: StoreApi<SheetViewStore>,
  campaignId: string,
  sheetId: string,
): SheetViewSlot {
  const key = viewKeyOf(campaignId, sheetId);
  return {
    current: () => store.getState().views[key] ?? null,
    remember: (view) => store.getState().remember(campaignId, sheetId, view),
  };
}

/** A slot that lives as long as whoever holds it (the editor's preview, a host with none given).
 *
 *  Example: `const view = options.view ?? localSheetViewSlot()` */
export function localSheetViewSlot(): SheetViewSlot {
  let kept: SheetViewDto | null = null;
  return {
    current: () => kept,
    remember: (view) => {
      kept = view;
    },
  };
}
