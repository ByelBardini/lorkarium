import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { readStoredChoice, writeStoredChoice, type ChoiceStorage } from '@/lib/stored-choice';

export type RoomPanel = 'open' | 'closed';

export const ROOM_TABS = ['combat', 'people', 'dice'] as const;

export type RoomTab = (typeof ROOM_TABS)[number];

export type RoomLayoutState = Readonly<{ panel: RoomPanel; tab: RoomTab; focus: boolean }>;

export type RoomLayoutStore = RoomLayoutState &
  Readonly<{
    togglePanel: () => void;
    showTab: (tab: RoomTab) => void;
    toggleFocus: () => void;
    exitFocus: () => void;
  }>;

export const ROOM_PANEL_STORAGE_KEY = 'lorkarium.roomPanel';

const PANELS: readonly RoomPanel[] = ['open', 'closed'];

/** How the play room is laid out around the board: the side panel (remembered in the browser),
 *  its tab and focus mode (board only). Only the panel is stored; tab and focus reset per visit.
 *
 *  Example: `createRoomLayoutStore(window.localStorage).getState().showTab('people')` */
export function createRoomLayoutStore(storage: ChoiceStorage): StoreApi<RoomLayoutStore> {
  return createStore<RoomLayoutStore>()((set, get) => ({
    panel: readStoredChoice(storage, ROOM_PANEL_STORAGE_KEY, PANELS, 'open'),
    tab: 'combat',
    focus: false,
    togglePanel: () => {
      const panel: RoomPanel = get().panel === 'open' ? 'closed' : 'open';
      set({ panel });
      writeStoredChoice(storage, ROOM_PANEL_STORAGE_KEY, panel);
    },
    showTab: (tab) => {
      set({ tab, panel: 'open' });
      writeStoredChoice(storage, ROOM_PANEL_STORAGE_KEY, 'open');
    },
    toggleFocus: () => set({ focus: !get().focus }),
    exitFocus: () => set({ focus: false }),
  }));
}

/** React view of one slice of the room layout (re-renders when it changes).
 *
 *  Example: `const focus = useRoomLayout(store, (state) => state.focus)` */
export function useRoomLayout<T>(
  store: StoreApi<RoomLayoutStore>,
  selector: (state: RoomLayoutStore) => T,
): T {
  return useStore(store, selector);
}

/** Whether a tab value from the UI (a plain string) is one of the room tabs.
 *
 *  Example: `if (isRoomTab(value)) store.getState().showTab(value)` */
export function isRoomTab(value: string): value is RoomTab {
  return ROOM_TABS.some((tab) => tab === value);
}
