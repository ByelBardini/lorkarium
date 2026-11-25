import { createContext, useContext } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { CustomEmojisResult } from '@/services/custom-emojis-api';
import { createCustomEmojisStore, type CustomEmojisStore } from '@/stores/custom-emojis-store';

const answerNone = (): Promise<CustomEmojisResult> =>
  Promise.resolve({ ok: true, value: { emojis: [], limit: 0 } });

/** The store of the account, set by `CustomEmojisProvider`. Outside a provider there is no
 *  account: the picker and the `:` list still work, with none of the account's own. */
export const CustomEmojisContext = createContext<StoreApi<CustomEmojisStore>>(
  createCustomEmojisStore({
    list: answerNone,
    create: answerNone,
    rename: answerNone,
    remove: answerNone,
  }),
);

/** The custom emojis of the account around this component.
 *
 *  Example: `const store = useCustomEmojisStore(); void store.getState().load()` */
export function useCustomEmojisStore(): StoreApi<CustomEmojisStore> {
  return useContext(CustomEmojisContext);
}
