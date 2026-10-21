import { CONE_ANGLE_MAX, REACH_MAX } from '@lorkarium/contracts';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { writeStoredChoice, type ChoiceStorage } from '@/lib/stored-choice';
import type { LightReach } from '@/services/light-commands';

export type LightReachStore = LightReach &
  Readonly<{
    /** How wide the next light opens, in degrees (360 = every side). */
    angle: number;
    setReach: (reach: LightReach) => void;
    setAngle: (angle: number) => void;
  }>;

const KEY = {
  bright: 'lorkarium.lightReach.bright',
  dim: 'lorkarium.lightReach.dim',
} as const;
const ANGLE_KEY = 'lorkarium.lightReach.angle';

/** A wall torch: 6 m + 6 m at 1.5 m per cell. */
export const DEFAULT_LIGHT_REACH: LightReach = { bright: 4, dim: 4 };

/** The bright and dim range of the next map light, in cells, and its opening, in degrees,
 *  remembered in the browser; a stored range that is not 0 to 100 (or a storage that throws) falls
 *  back to the torch, and an opening that is not a whole 1 to 360 to every side.
 *
 *  Example: `createLightReachStore(window.localStorage).getState().setReach({ bright: 6, dim: 6 })` */
export function createLightReachStore(storage: ChoiceStorage): StoreApi<LightReachStore> {
  return createStore<LightReachStore>()((set) => ({
    bright: storedReach(storage, 'bright'),
    dim: storedReach(storage, 'dim'),
    angle: storedAngle(storage),
    setReach: ({ bright, dim }) => {
      set({ bright, dim });
      writeStoredChoice(storage, KEY.bright, String(bright));
      writeStoredChoice(storage, KEY.dim, String(dim));
    },
    setAngle: (angle) => {
      set({ angle });
      writeStoredChoice(storage, ANGLE_KEY, String(angle));
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

function storedAngle(storage: ChoiceStorage): number {
  try {
    const angle = Number(storage.getItem(ANGLE_KEY) ?? Number.NaN);
    return Number.isInteger(angle) && angle >= 1 && angle <= CONE_ANGLE_MAX
      ? angle
      : CONE_ANGLE_MAX;
  } catch {
    return CONE_ANGLE_MAX;
  }
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
