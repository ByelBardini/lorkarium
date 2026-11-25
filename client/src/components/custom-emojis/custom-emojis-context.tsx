import { useEffect, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { CustomEmojisApi } from '@/services/custom-emojis-api';
import { createCustomEmojisStore, type CustomEmojisStore } from '@/stores/custom-emojis-store';
import { CustomEmojisContext } from './use-custom-emojis-store';

export type CustomEmojisProviderProps = Readonly<{
  api: CustomEmojisApi;
  /** The account: another one gets a new store, so it never shows the previous list. */
  userId: string;
  children: React.ReactNode;
}>;

type AccountStore = Readonly<{ userId: string; store: StoreApi<CustomEmojisStore> }>;

// State, not `useMemo`: React may drop a memo, and that would lose the list of the same account.
function useStoreOfAccount(api: CustomEmojisApi, userId: string): StoreApi<CustomEmojisStore> {
  const [held, setHeld] = useState<AccountStore>(() => ({
    userId,
    store: createCustomEmojisStore(api),
  }));
  if (held.userId === userId) return held.store;
  const next = { userId, store: createCustomEmojisStore(api) };
  setHeld(next);
  return next.store;
}

/** Gives the chat fields and "Minha conta" below it the custom emojis of the logged-in account,
 *  loaded once when it mounts.
 *
 *  Example: `<CustomEmojisProvider api={api} userId={user.id}>…</CustomEmojisProvider>` */
export function CustomEmojisProvider({
  api,
  userId,
  children,
}: CustomEmojisProviderProps): React.JSX.Element {
  const store = useStoreOfAccount(api, userId);
  useEffect(() => {
    void store.getState().load();
  }, [store]);
  return <CustomEmojisContext value={store}>{children}</CustomEmojisContext>;
}
