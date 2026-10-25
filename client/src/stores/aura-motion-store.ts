import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { readStoredChoice, writeStoredChoice, type ChoiceStorage } from '@/lib/stored-choice';

/** "Animar auras": whether this browser animates the auras (local, nobody else is affected). */
export type AuraMotionStore = Readonly<{
  animated: boolean;
  toggle: () => void;
}>;

const KEY = 'lorkarium.auraMotion';
const CHOICES = ['on', 'off'] as const;

/** Whether the auras animate here, remembered in the browser; on by default, and on when the
 *  stored value is unknown or the storage throws (a weak PC turns it off, nobody else is touched).
 *
 *  Example: `createAuraMotionStore(window.localStorage).getState().toggle()` */
export function createAuraMotionStore(storage: ChoiceStorage): StoreApi<AuraMotionStore> {
  const stored = readStoredChoice(storage, KEY, CHOICES, 'on');
  return createStore<AuraMotionStore>()((set, get) => ({
    animated: stored === 'on',
    toggle: () => {
      const animated = !get().animated;
      set({ animated });
      writeStoredChoice(storage, KEY, animated ? 'on' : 'off');
    },
  }));
}

/** React view of "Animar auras".
 *
 *  Example: `const animated = useAuraMotion(store, (state) => state.animated)` */
export function useAuraMotion<T>(
  store: StoreApi<AuraMotionStore>,
  selector: (state: AuraMotionStore) => T,
): T {
  return useStore(store, selector);
}
