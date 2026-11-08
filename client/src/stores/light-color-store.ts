import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { LIGHT_COLOR_TONES, type LightColor } from '@/lib/light-color';
import { readStoredColor, writeStoredChoice, type ChoiceStorage } from '@/lib/stored-choice';

export type LightColorStore = Readonly<{
  color: LightColor;
  setColor: (color: LightColor) => void;
}>;

const KEY = 'lorkarium.lightColor';
// The storage keeps strings: the neutral light is remembered by a word of its own.
const NEUTRAL = 'none' as const;

/** The color of the next map light, remembered in the browser; a stored value that is neither a
 *  palette name nor a custom hex (or a storage that throws) starts neutral.
 *
 *  Example: `createLightColorStore(window.localStorage).getState().setColor('moon')` */
export function createLightColorStore(storage: ChoiceStorage): StoreApi<LightColorStore> {
  return createStore<LightColorStore>()((set) => ({
    color: storedColor(storage),
    setColor: (color) => {
      set({ color });
      writeStoredChoice(storage, KEY, color ?? NEUTRAL);
    },
  }));
}

/** React view of a slice of the light color.
 *
 *  Example: `const color = useLightColor(store, (state) => state.color)` */
export function useLightColor<T>(
  store: StoreApi<LightColorStore>,
  selector: (state: LightColorStore) => T,
): T {
  return useStore(store, selector);
}

function storedColor(storage: ChoiceStorage): LightColor {
  const names = [NEUTRAL, ...LIGHT_COLOR_TONES.map(({ color }) => color)];
  const stored = readStoredColor(storage, KEY, names, NEUTRAL);
  return stored === NEUTRAL ? null : stored;
}
