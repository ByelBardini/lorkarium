import { presenceVisibilityDto, type PresenceVisibilityDto } from '@lorkarium/contracts';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { readStoredChoice, writeStoredChoice, type ChoiceStorage } from '@/lib/stored-choice';

export const PRESENCE_CHOICE_STORAGE_KEY = 'lorkarium.presence';

export type PresenceChoiceStore = Readonly<{
  /** What the account chose: Online or Invisível (remembered on this device). */
  choice: PresenceVisibilityDto;
  /** Automatic: the tab sat idle (the menu shows "Ausente" while online). */
  away: boolean;
  choose: (choice: PresenceVisibilityDto) => void;
  setAway: (away: boolean) => void;
}>;

/** The status the account chose for its friends, remembered in `localStorage`; the account
 *  socket sends it at every connection (`linkPresenceChoice`).
 *
 *  Example: `createPresenceChoiceStore(localStorage).getState().choose('invisible')` */
export function createPresenceChoiceStore(storage: ChoiceStorage): StoreApi<PresenceChoiceStore> {
  const stored = readStoredChoice(
    storage,
    PRESENCE_CHOICE_STORAGE_KEY,
    presenceVisibilityDto.options,
    'online',
  );
  return createStore<PresenceChoiceStore>()((set) => ({
    choice: stored,
    away: false,
    choose: (choice) => {
      set({ choice });
      writeStoredChoice(storage, PRESENCE_CHOICE_STORAGE_KEY, choice);
    },
    setAway: (away) => set({ away }),
  }));
}

/** React view of the presence choice.
 *
 *  Example: `const choice = usePresenceChoice(presenceChoice, (state) => state.choice)` */
export function usePresenceChoice<T>(
  store: StoreApi<PresenceChoiceStore>,
  select: (state: PresenceChoiceStore) => T,
): T {
  return useStore(store, select);
}
