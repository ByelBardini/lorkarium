import type { DrawingColorDto, StrokeWidthDto } from '@lorkarium/contracts';
import { Circle, Pencil, Square, Triangle, type LucideIcon } from 'lucide-react';
import type { StoreApi } from 'zustand/vanilla';
import type { DrawingKind } from '@/lib/drawing-geometry';
import { DRAWING_KINDS, STROKE_WIDTHS } from '@/lib/drawing-style';
import { useDrawingStyle, type DrawingStyleStore } from '@/stores/drawing-style-store';
import { COLOR_TILES } from './color-tiles';
import { StyleTileGroup, type StyleTile } from './style-tile-group';

export type DrawStylePanelProps = Readonly<{ drawingStyle: StoreApi<DrawingStyleStore> }>;

export const FILL_ONLY_FIXED_HINT = 'Só formas fixas têm preenchimento.';

// "Nenhum" is a radio value like the colors; the store keeps it as `null`.
const NO_FILL = 'none';
type FillChoice = DrawingColorDto | typeof NO_FILL;

const KIND_ICONS: Readonly<Record<DrawingKind, LucideIcon>> = {
  freehand: Pencil,
  rectangle: Square,
  ellipse: Circle,
  triangle: Triangle,
};

const KIND_TILES: readonly StyleTile<DrawingKind>[] = DRAWING_KINDS.map(({ kind, label }) => {
  const Icon = KIND_ICONS[kind];
  return { value: kind, label, picture: <Icon aria-hidden="true" className="size-4" /> };
});

// The "none" swatch is the market convention: an empty circle crossed by a red slash.
const NO_FILL_TILE: StyleTile<FillChoice> = {
  value: NO_FILL,
  label: 'Nenhum',
  picture: (
    <span
      aria-hidden="true"
      className="size-full rounded-full border border-border bg-[linear-gradient(to_top_right,transparent_calc(50%-1px),var(--destructive)_calc(50%-1px),var(--destructive)_calc(50%+1px),transparent_calc(50%+1px))]"
    />
  ),
};

const FILL_TILES: readonly StyleTile<FillChoice>[] = [NO_FILL_TILE, ...COLOR_TILES];

// Each width tile previews the line itself, scaled down from its world px.
const WIDTH_TILES: readonly StyleTile<StrokeWidthDto>[] = STROKE_WIDTHS.map(
  ({ width, label, worldPx }) => ({
    value: width,
    label,
    picture: (
      <span
        aria-hidden="true"
        className="w-5 rounded-full bg-current"
        style={{ height: worldPx / 2 + 1 }}
      />
    ),
  }),
);

/** The style of the next drawing, floating beside the toolbar while the draw tool is on: shape,
 *  stroke color, fill (fixed shapes only) and line width. Remembered in the browser.
 *
 *  Example: `{tool === 'draw' && <DrawStylePanel drawingStyle={deps.drawingStyle} />}` */
export function DrawStylePanel({ drawingStyle }: DrawStylePanelProps): React.JSX.Element {
  const kind = useDrawingStyle(drawingStyle, (state) => state.kind);
  const stroke = useDrawingStyle(drawingStyle, (state) => state.stroke);
  const fill = useDrawingStyle(drawingStyle, (state) => state.fill);
  const strokeWidth = useDrawingStyle(drawingStyle, (state) => state.strokeWidth);
  const actions = drawingStyle.getState();
  const freehand = kind === 'freehand';
  return (
    <section
      aria-label="Estilo do desenho"
      className="absolute top-16 left-16 flex w-60 flex-col gap-4 rounded-lg border border-border bg-panel p-4"
    >
      <StyleTileGroup
        legend="Forma"
        value={kind}
        tiles={KIND_TILES}
        onChange={actions.setKind}
        shape="square"
      />
      <StyleTileGroup
        legend="Cor do traço"
        value={stroke}
        tiles={COLOR_TILES}
        onChange={actions.setStroke}
        shape="round"
      />
      <StyleTileGroup
        legend="Preenchimento"
        value={fill ?? NO_FILL}
        tiles={FILL_TILES}
        onChange={(choice) => actions.setFill(choice === NO_FILL ? null : choice)}
        shape="round"
        disabled={freehand}
        hint={freehand ? FILL_ONLY_FIXED_HINT : undefined}
      />
      <StyleTileGroup
        legend="Espessura"
        value={strokeWidth}
        tiles={WIDTH_TILES}
        onChange={actions.setStrokeWidth}
        shape="square"
      />
    </section>
  );
}
