import type { DrawingColorDto, EffectAreaKindDto } from '@lorkarium/contracts';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { DRAWING_COLORS } from '@/lib/drawing-style';
import {
  DEFAULT_EFFECT_AREA_STYLE,
  EFFECT_AREA_KINDS,
  type EffectAreaStyle,
} from '@/lib/effect-area-style';
import { readStoredChoice, writeStoredChoice, type ChoiceStorage } from '@/lib/stored-choice';

export type EffectAreaStyleStore = EffectAreaStyle &
  Readonly<{
    setKind: (kind: EffectAreaKindDto) => void;
    setColor: (color: DrawingColorDto) => void;
  }>;

const KEY = {
  kind: 'lorkarium.effectAreaStyle.kind',
  color: 'lorkarium.effectAreaStyle.color',
} as const;

/** The shape and color of the next area of effect, remembered in the browser per choice; a
 *  storage that throws keeps the choices in memory for the visit.
 *
 *  Example: `createEffectAreaStyleStore(window.localStorage).getState().setKind('diagonal_cone')` */
export function createEffectAreaStyleStore(storage: ChoiceStorage): StoreApi<EffectAreaStyleStore> {
  const remember = (key: string, value: string): void => writeStoredChoice(storage, key, value);
  return createStore<EffectAreaStyleStore>()((set) => ({
    ...storedStyle(storage),
    setKind: (kind) => {
      set({ kind });
      remember(KEY.kind, kind);
    },
    setColor: (color) => {
      set({ color });
      remember(KEY.color, color);
    },
  }));
}

/** Just the style, without the setters.
 *
 *  Example: `buildBoardView({ …, effectAreaStyle: effectAreaStyleOf(style.getState()) })` */
export function effectAreaStyleOf({ kind, color }: EffectAreaStyle): EffectAreaStyle {
  return { kind, color };
}

/** React view of a slice of the area style.
 *
 *  Example: `const kind = useEffectAreaStyle(store, (state) => state.kind)` */
export function useEffectAreaStyle<T>(
  store: StoreApi<EffectAreaStyleStore>,
  selector: (state: EffectAreaStyleStore) => T,
): T {
  return useStore(store, selector);
}

function storedStyle(storage: ChoiceStorage): EffectAreaStyle {
  const fallback = DEFAULT_EFFECT_AREA_STYLE;
  const kinds = EFFECT_AREA_KINDS.map(({ kind }) => kind);
  const colors = DRAWING_COLORS.map(({ color }) => color);
  return {
    kind: readStoredChoice(storage, KEY.kind, kinds, fallback.kind),
    color: readStoredChoice(storage, KEY.color, colors, fallback.color),
  };
}
