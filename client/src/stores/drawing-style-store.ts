import type { DrawingColorDto, StrokeWidthDto } from '@lorkarium/contracts';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { DrawingKind } from '@/lib/drawing-geometry';
import {
  DEFAULT_DRAWING_STYLE,
  DRAWING_COLORS,
  DRAWING_KINDS,
  STROKE_WIDTHS,
  type DrawingStyle,
} from '@/lib/drawing-style';
import { readStoredChoice, writeStoredChoice, type ChoiceStorage } from '@/lib/stored-choice';

export type DrawingStyleStore = DrawingStyle &
  Readonly<{
    setKind: (kind: DrawingKind) => void;
    setStroke: (stroke: DrawingColorDto) => void;
    /** `null` is "Nenhum". */
    setFill: (fill: DrawingColorDto | null) => void;
    setStrokeWidth: (strokeWidth: StrokeWidthDto) => void;
  }>;

const KEY = {
  kind: 'lorkarium.drawingStyle.kind',
  stroke: 'lorkarium.drawingStyle.stroke',
  fill: 'lorkarium.drawingStyle.fill',
  strokeWidth: 'lorkarium.drawingStyle.strokeWidth',
} as const;

// The storage keeps strings: "Nenhum" is written as this word.
const NO_FILL = 'none';
const COLORS = DRAWING_COLORS.map(({ color }) => color);

/** How the next drawing looks, remembered in the browser per choice; a storage that throws
 *  keeps the choices in memory for the visit.
 *
 *  Example: `createDrawingStyleStore(window.localStorage).getState().setKind('ellipse')` */
export function createDrawingStyleStore(storage: ChoiceStorage): StoreApi<DrawingStyleStore> {
  const remember = (key: string, value: string): void => writeStoredChoice(storage, key, value);
  return createStore<DrawingStyleStore>()((set) => ({
    ...storedStyle(storage),
    setKind: (kind) => {
      set({ kind });
      remember(KEY.kind, kind);
    },
    setStroke: (stroke) => {
      set({ stroke });
      remember(KEY.stroke, stroke);
    },
    setFill: (fill) => {
      set({ fill });
      remember(KEY.fill, fill ?? NO_FILL);
    },
    setStrokeWidth: (strokeWidth) => {
      set({ strokeWidth });
      remember(KEY.strokeWidth, strokeWidth);
    },
  }));
}

/** Just the style, without the setters.
 *
 *  Example: `buildBoardView({ …, drawingStyle: styleOf(style.getState()) })` */
export function styleOf({ kind, stroke, fill, strokeWidth }: DrawingStyle): DrawingStyle {
  return { kind, stroke, fill, strokeWidth };
}

/** React view of a slice of the drawing style.
 *
 *  Example: `const kind = useDrawingStyle(store, (state) => state.kind)` */
export function useDrawingStyle<T>(
  store: StoreApi<DrawingStyleStore>,
  selector: (state: DrawingStyleStore) => T,
): T {
  return useStore(store, selector);
}

function storedStyle(storage: ChoiceStorage): DrawingStyle {
  const fallback = DEFAULT_DRAWING_STYLE;
  const kinds = DRAWING_KINDS.map(({ kind }) => kind);
  const widths = STROKE_WIDTHS.map(({ width }) => width);
  const fill = readStoredChoice(storage, KEY.fill, [...COLORS, NO_FILL], fallback.fill ?? NO_FILL);
  return {
    kind: readStoredChoice(storage, KEY.kind, kinds, fallback.kind),
    stroke: readStoredChoice(storage, KEY.stroke, COLORS, fallback.stroke),
    fill: fill === NO_FILL ? null : fill,
    strokeWidth: readStoredChoice(storage, KEY.strokeWidth, widths, fallback.strokeWidth),
  };
}
