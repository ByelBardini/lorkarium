import { useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { SavedColorsApi } from '@/services/saved-colors-api';
import { createSavedColorsStore, type SavedColorsStore } from '@/stores/saved-colors-store';
import { SavedColorsContext } from './use-saved-colors-store';

export type SavedColorsProviderProps = Readonly<{
  api: SavedColorsApi;
  /** The account: another one gets a new store, so it never shows the previous list. */
  userId: string;
  children: React.ReactNode;
}>;

type AccountStore = Readonly<{
  userId: string;
  store: StoreApi<SavedColorsStore>;
}>;

// State, not `useMemo`: React may drop a memo, and that would lose the list of the same account.
function useStoreOfAccount(api: SavedColorsApi, userId: string): StoreApi<SavedColorsStore> {
  const [held, setHeld] = useState<AccountStore>(() => ({
    userId,
    store: createSavedColorsStore(api),
  }));
  if (held.userId === userId) return held.store;
  const next = { userId, store: createSavedColorsStore(api) };
  setHeld(next);
  return next.store;
}

/** Gives the color pickers below it the saved colors of the logged-in account.
 *
 *  Example: `<SavedColorsProvider api={api} userId={user.id}>…</SavedColorsProvider>` */
export function SavedColorsProvider({
  api,
  userId,
  children,
}: SavedColorsProviderProps): React.JSX.Element {
  return <SavedColorsContext value={useStoreOfAccount(api, userId)}>{children}</SavedColorsContext>;
}
