import { REACH_MAX } from '@lorkarium/contracts';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { writeStoredChoice, type ChoiceStorage } from '@/lib/stored-choice';
import type { LightReach } from '@/services/light-commands';

export type LightReachStore = LightReach &
  Readonly<{
    setReach: (reach: LightReach) => void;
  }>;

const KEY = {
  bright: 'lorkarium.lightReach.bright',
  dim: 'lorkarium.lightReach.dim',
} as const;

/** A wall torch: 6 m + 6 m at 1.5 m per cell. */
export const DEFAULT_LIGHT_REACH: LightReach = { bright: 4, dim: 4 };

/** The bright and dim range of the next map light, in cells, remembered in the browser; a stored
 *  value that is not 0 to 100 (or a storage that throws) falls back to the torch.
 *
 *  Example: `createLightReachStore(window.localStorage).getState().setReach({ bright: 6, dim: 6 })` */
export function createLightReachStore(storage: ChoiceStorage): StoreApi<LightReachStore> {
  return createStore<LightReachStore>()((set) => ({
    bright: storedReach(storage, 'bright'),
    dim: storedReach(storage, 'dim'),
    setReach: ({ bright, dim }) => {
      set({ bright, dim });
      writeStoredChoice(storage, KEY.bright, String(bright));
      writeStoredChoice(storage, KEY.dim, String(dim));
    },
  }));
}

/** Just the reach, without the setter.
 *
 *  Example: `local.placeLight(point, lightReachOf(lightReach.getState()))` */
export function lightReachOf({ bright, dim }: LightReach): LightReach {
  return { bright, dim };
}

/** React view of a slice of the light reach.
 *
 *  Example: `const bright = useLightReach(store, (state) => state.bright)` */
export function useLightReach<T>(
  store: StoreApi<LightReachStore>,
  selector: (state: LightReachStore) => T,
): T {
  return useStore(store, selector);
}

function storedReach(storage: ChoiceStorage, side: keyof typeof KEY): number {
  const fallback = DEFAULT_LIGHT_REACH[side];
  try {
    const stored = storage.getItem(KEY[side]);
    const cells = stored === null ? Number.NaN : Number(stored);
    return Number.isFinite(cells) && cells >= 0 && cells <= REACH_MAX ? cells : fallback;
  } catch {
    return fallback;
  }
}
