import type { HexColorDto } from '@lorkarium/contracts';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type {
  SavedColorsApi,
  SavedColorsFailure,
  SavedColorsResult,
} from '@/services/saved-colors-api';

export type SavedColorsStore = Readonly<{
  /** The last list the server answered, most recent first. */
  colors: readonly HexColorDto[];
  /** Why the last call failed; the list stays the last known one. */
  problem: SavedColorsFailure | null;
  load: () => Promise<void>;
  save: (color: HexColorDto) => Promise<void>;
  remove: (color: HexColorDto) => Promise<void>;
}>;

function settledBy(result: SavedColorsResult): Partial<SavedColorsStore> {
  return result.ok ? { colors: result.value, problem: null } : { problem: result.failure };
}

/** The saved colors of one account, always replaced by what the server answered.
 *
 *  Example: `const store = createSavedColorsStore(api); await store.getState().load()` */
export function createSavedColorsStore(api: SavedColorsApi): StoreApi<SavedColorsStore> {
  let newestLoad = 0;
  let newestCommand = 0;
  return createStore<SavedColorsStore>((set) => {
    // A command's answer is the whole list, so only the newest one is still true.
    const command = async (send: () => Promise<SavedColorsResult>): Promise<void> => {
      const mine = ++newestCommand;
      const result = await send();
      if (mine === newestCommand) set(settledBy(result));
    };
    // A load started before a command may have read the list from before that command.
    const load = async (): Promise<void> => {
      const mine = ++newestLoad;
      const commandsWhenAsked = newestCommand;
      const result = await api.list();
      if (mine === newestLoad && commandsWhenAsked === newestCommand) set(settledBy(result));
    };
    return {
      colors: [],
      problem: null,
      load,
      save: (color) => command(() => api.save(color)),
      remove: (color) => command(() => api.remove(color)),
    };
  });
}

/** Subscribes a component to a part of the saved colors.
 *
 *  Example: `const colors = useSavedColors(store, (state) => state.colors)` */
export function useSavedColors<T>(
  store: StoreApi<SavedColorsStore>,
  pick: (state: SavedColorsStore) => T,
): T {
  return useStore(store, pick);
}
