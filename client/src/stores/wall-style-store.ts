import type { WallKindDto, WallShapeKindDto } from '@lorkarium/contracts';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { readStoredChoice, writeStoredChoice, type ChoiceStorage } from '@/lib/stored-choice';
import { DEFAULT_WALL_STYLE, WALL_KINDS, WALL_SHAPES, type WallStyle } from '@/lib/wall-style';

export type WallStyleStore = WallStyle &
  Readonly<{
    setKind: (kind: WallKindDto) => void;
    setShape: (shape: WallShapeKindDto) => void;
  }>;

const KEY = {
  kind: 'lorkarium.wallStyle.kind',
  shape: 'lorkarium.wallStyle.shape',
} as const;

/** The kind and shape of the next wall, remembered in the browser per choice; a storage that
 *  throws keeps the choices in memory for the visit.
 *
 *  Example: `createWallStyleStore(window.localStorage).getState().setKind('grate')` */
export function createWallStyleStore(storage: ChoiceStorage): StoreApi<WallStyleStore> {
  const remember = (key: string, value: string): void => writeStoredChoice(storage, key, value);
  return createStore<WallStyleStore>()((set) => ({
    ...storedStyle(storage),
    setKind: (kind) => {
      set({ kind });
      remember(KEY.kind, kind);
    },
    setShape: (shape) => {
      set({ shape });
      remember(KEY.shape, shape);
    },
  }));
}

/** Just the style, without the setters.
 *
 *  Example: `local.finishWall(sketch, wallStyleOf(wallStyle.getState()), scene)` */
export function wallStyleOf({ kind, shape }: WallStyle): WallStyle {
  return { kind, shape };
}

/** React view of a slice of the wall style.
 *
 *  Example: `const kind = useWallStyle(store, (state) => state.kind)` */
export function useWallStyle<T>(
  store: StoreApi<WallStyleStore>,
  selector: (state: WallStyleStore) => T,
): T {
  return useStore(store, selector);
}

function storedStyle(storage: ChoiceStorage): WallStyle {
  const fallback = DEFAULT_WALL_STYLE;
  return {
    kind: readStoredChoice(
      storage,
      KEY.kind,
      WALL_KINDS.map(({ kind }) => kind),
      fallback.kind,
    ),
    shape: readStoredChoice(
      storage,
      KEY.shape,
      WALL_SHAPES.map(({ shape }) => shape),
      fallback.shape,
    ),
  };
}
