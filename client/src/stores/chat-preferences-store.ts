import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { readStoredSwitch, writeStoredSwitch, type ChoiceStorage } from '@/lib/stored-choice';

/** "Som do chat": whether this device plays the short sound of a mention or a whisper (local:
 *  one may play muted in a call, and the dice sound is a switch of its own). */
export type ChatPreferencesStore = Readonly<{
  sound: boolean;
  setSound: (sound: boolean) => void;
}>;

export const CHAT_SOUND_STORAGE_KEY = 'lorkarium.chatSound';

/** The chat preferences of this browser, in `localStorage`; the sound is on by default, and on
 *  when the stored value is unknown or the storage throws.
 *
 *  Example: `createChatPreferencesStore(window.localStorage).getState().setSound(false)` */
export function createChatPreferencesStore(storage: ChoiceStorage): StoreApi<ChatPreferencesStore> {
  return createStore<ChatPreferencesStore>()((set) => ({
    sound: readStoredSwitch(storage, CHAT_SOUND_STORAGE_KEY),
    setSound: (sound) => {
      set({ sound });
      writeStoredSwitch(storage, CHAT_SOUND_STORAGE_KEY, sound);
    },
  }));
}

/** React view of the chat preferences.
 *
 *  Example: `const sound = useChatPreferences(store, (state) => state.sound)` */
export function useChatPreferences<T>(
  store: StoreApi<ChatPreferencesStore>,
  selector: (state: ChatPreferencesStore) => T,
): T {
  return useStore(store, selector);
}
