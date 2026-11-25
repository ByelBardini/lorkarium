import type { CustomEmojiDto, CustomEmojiListDto } from '@lorkarium/contracts';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type {
  CustomEmojisApi,
  CustomEmojisFailure,
  CustomEmojisResult,
} from '@/services/custom-emojis-api';

export type CustomEmojisStore = Readonly<{
  /** The last list the server answered (oldest first); `null` before the first answer. */
  list: CustomEmojiListDto | null;
  /** Why the last call failed; the list stays the last known one. */
  problem: CustomEmojisFailure | null;
  load: () => Promise<void>;
  /** Each command answers whether it went through, so a form knows to clear itself. */
  create: (name: string, picture: Blob) => Promise<boolean>;
  rename: (emojiId: string, name: string) => Promise<boolean>;
  remove: (emojiId: string) => Promise<boolean>;
}>;

/** The emojis a message of this account can use now: the active ones.
 *
 *  Example: `activeCustomEmojisOf(store.getState().list).map((emoji) => emoji.name)` */
export function activeCustomEmojisOf(list: CustomEmojiListDto | null): readonly CustomEmojiDto[] {
  return list === null ? [] : list.emojis.filter((emoji) => emoji.active);
}

function settledBy(result: CustomEmojisResult): Partial<CustomEmojisStore> {
  return result.ok ? { list: result.value, problem: null } : { problem: result.failure };
}

/** The custom emojis of one account, always replaced by what the server answered.
 *
 *  Example: `const store = createCustomEmojisStore(api); await store.getState().load()` */
export function createCustomEmojisStore(api: CustomEmojisApi): StoreApi<CustomEmojisStore> {
  let newestLoad = 0;
  let newestCommand = 0;
  return createStore<CustomEmojisStore>((set) => {
    // A command's answer is the whole list, so only the newest one is still true.
    const command = async (send: () => Promise<CustomEmojisResult>): Promise<boolean> => {
      const mine = ++newestCommand;
      const result = await send();
      if (mine === newestCommand) set(settledBy(result));
      return result.ok;
    };
    // A load started before a command may have read the list from before that command.
    const load = async (): Promise<void> => {
      const mine = ++newestLoad;
      const commandsWhenAsked = newestCommand;
      const result = await api.list();
      if (mine === newestLoad && commandsWhenAsked === newestCommand) set(settledBy(result));
    };
    return {
      list: null,
      problem: null,
      load,
      create: (name, picture) => command(() => api.create(name, picture)),
      rename: (emojiId, name) => command(() => api.rename(emojiId, name)),
      remove: (emojiId) => command(() => api.remove(emojiId)),
    };
  });
}

/** Subscribes a component to a part of the custom emojis.
 *
 *  Example: `const list = useCustomEmojis(store, (state) => state.list)` */
export function useCustomEmojis<T>(
  store: StoreApi<CustomEmojisStore>,
  pick: (state: CustomEmojisStore) => T,
): T {
  return useStore(store, pick);
}
