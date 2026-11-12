import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { readStoredChoice, writeStoredChoice, type ChoiceStorage } from '@/lib/stored-choice';

/** "Som do chat": whether this device plays the short sound of a mention or a whisper (local:
 *  one may play muted in a call, and the dice sound is a switch of its own). */
export type ChatPreferencesStore = Readonly<{
  sound: boolean;
  setSound: (sound: boolean) => void;
}>;

export const CHAT_SOUND_STORAGE_KEY = 'lorkarium.chatSound';

const CHOICES = ['on', 'off'] as const;

/** The chat preferences of this browser, in `localStorage`; the sound is on by default, and on
 *  when the stored value is unknown or the storage throws.
 *
 *  Example: `createChatPreferencesStore(window.localStorage).getState().setSound(false)` */
export function createChatPreferencesStore(storage: ChoiceStorage): StoreApi<ChatPreferencesStore> {
  return createStore<ChatPreferencesStore>()((set) => ({
    sound: readStoredChoice(storage, CHAT_SOUND_STORAGE_KEY, CHOICES, 'on') === 'on',
    setSound: (sound) => {
      set({ sound });
      writeStoredChoice(storage, CHAT_SOUND_STORAGE_KEY, sound ? 'on' : 'off');
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
