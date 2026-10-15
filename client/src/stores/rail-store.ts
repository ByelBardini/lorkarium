import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

export type RailState = 'expanded' | 'collapsed';

export type RailStore = Readonly<{ rail: RailState; toggle: () => void }>;

/** The part of `localStorage` the rail needs; injected so tests and blocked storage work. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const RAIL_STORAGE_KEY = 'lorkarium.rail';

const DEFAULT_RAIL: RailState = 'expanded';

/** The navigation rail preference, remembered in the browser; a failing storage falls back to memory.
 *
 *  Example: `createRailStore(window.localStorage).getState().toggle()` */
export function createRailStore(storage: KeyValueStorage): StoreApi<RailStore> {
  return createStore<RailStore>()((set, get) => ({
    rail: readRail(storage),
    toggle: () => {
      const rail: RailState = get().rail === 'expanded' ? 'collapsed' : 'expanded';
      set({ rail });
      writeRail(storage, rail);
    },
  }));
}

/** React view of the rail (re-renders on change).
 *
 *  Example: `const { rail, toggle } = useRail(railStore)` */
export function useRail(store: StoreApi<RailStore>): RailStore {
  const rail = useStore(store, (state) => state.rail);
  const toggle = useStore(store, (state) => state.toggle);
  return { rail, toggle };
}

// Private mode or blocked site data throws on access: the preference is a convenience, not state.
function readRail(storage: KeyValueStorage): RailState {
  try {
    const stored = storage.getItem(RAIL_STORAGE_KEY);
    return stored === 'collapsed' || stored === 'expanded' ? stored : DEFAULT_RAIL;
  } catch {
    return DEFAULT_RAIL;
  }
}

function writeRail(storage: KeyValueStorage, rail: RailState): void {
  try {
    storage.setItem(RAIL_STORAGE_KEY, rail);
  } catch {
    // Keeps working in memory for this visit.
  }
}
