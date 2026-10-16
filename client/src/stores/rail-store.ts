import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { readStoredChoice, writeStoredChoice, type ChoiceStorage } from '@/lib/stored-choice';

export type RailState = 'expanded' | 'collapsed';

export type RailStore = Readonly<{ rail: RailState; toggle: () => void }>;

/** The part of `localStorage` the rail needs; injected so tests and blocked storage work. */
export type KeyValueStorage = ChoiceStorage;

export const RAIL_STORAGE_KEY = 'lorkarium.rail';

const RAIL_STATES: readonly RailState[] = ['expanded', 'collapsed'];

/** The navigation rail preference, remembered in the browser; a failing storage falls back to memory.
 *
 *  Example: `createRailStore(window.localStorage).getState().toggle()` */
export function createRailStore(storage: KeyValueStorage): StoreApi<RailStore> {
  return createStore<RailStore>()((set, get) => ({
    rail: readStoredChoice(storage, RAIL_STORAGE_KEY, RAIL_STATES, 'expanded'),
    toggle: () => {
      const rail: RailState = get().rail === 'expanded' ? 'collapsed' : 'expanded';
      set({ rail });
      writeStoredChoice(storage, RAIL_STORAGE_KEY, rail);
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
