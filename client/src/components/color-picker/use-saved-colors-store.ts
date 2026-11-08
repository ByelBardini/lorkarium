import { createContext, useContext } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { SavedColorsResult } from '@/services/saved-colors-api';
import { createSavedColorsStore, type SavedColorsStore } from '@/stores/saved-colors-store';

const answerEmptyList = (): Promise<SavedColorsResult> => Promise.resolve({ ok: true, value: [] });

/** The store of the account, set by `SavedColorsProvider`. Outside a provider there is no
 *  account: the picker still opens, with nothing saved and nothing to save to. */
export const SavedColorsContext = createContext<StoreApi<SavedColorsStore>>(
  createSavedColorsStore({
    list: answerEmptyList,
    save: answerEmptyList,
    remove: answerEmptyList,
  }),
);

/** The saved colors of the account around this component.
 *
 *  Example: `const store = useSavedColorsStore(); void store.getState().load()` */
export function useSavedColorsStore(): StoreApi<SavedColorsStore> {
  return useContext(SavedColorsContext);
}
