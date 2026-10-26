import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { readStoredChoice, writeStoredChoice, type ChoiceStorage } from '@/lib/stored-choice';

/** "Dados 3D": whether this device draws the thrown dice over the window (local: the WebGL
 *  cost is the device's; the result waits the same time either way). "Som dos dados": whether it
 *  plays the knocks of the rolls (local too: one may play muted in a call). */
export type DicePreferencesStore = Readonly<{
  threeD: boolean;
  sound: boolean;
  setThreeD: (threeD: boolean) => void;
  setSound: (sound: boolean) => void;
}>;

export const DICE_3D_STORAGE_KEY = 'lorkarium.dice3d';
export const DICE_SOUND_STORAGE_KEY = 'lorkarium.diceSound';

const CHOICES = ['on', 'off'] as const;

function storedSwitchOf(storage: ChoiceStorage, key: string): boolean {
  return readStoredChoice(storage, key, CHOICES, 'on') === 'on';
}

function storeSwitch(storage: ChoiceStorage, key: string, on: boolean): void {
  writeStoredChoice(storage, key, on ? 'on' : 'off');
}

/** The dice preferences of this browser, in `localStorage`; the 3D dice and their sound are on by
 *  default, and on when the stored value is unknown or the storage throws.
 *
 *  Example: `createDicePreferencesStore(window.localStorage).getState().setSound(false)` */
export function createDicePreferencesStore(storage: ChoiceStorage): StoreApi<DicePreferencesStore> {
  return createStore<DicePreferencesStore>()((set) => ({
    threeD: storedSwitchOf(storage, DICE_3D_STORAGE_KEY),
    sound: storedSwitchOf(storage, DICE_SOUND_STORAGE_KEY),
    setThreeD: (threeD) => {
      set({ threeD });
      storeSwitch(storage, DICE_3D_STORAGE_KEY, threeD);
    },
    setSound: (sound) => {
      set({ sound });
      storeSwitch(storage, DICE_SOUND_STORAGE_KEY, sound);
    },
  }));
}

/** React view of the dice preferences.
 *
 *  Example: `const threeD = useDicePreferences(store, (state) => state.threeD)` */
export function useDicePreferences<T>(
  store: StoreApi<DicePreferencesStore>,
  selector: (state: DicePreferencesStore) => T,
): T {
  return useStore(store, selector);
}
