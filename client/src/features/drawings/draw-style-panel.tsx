import type { DrawingColorDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import { ChoiceField, type ChoiceOption } from '@/components/choice-field';
import type { DrawingKind } from '@/lib/drawing-geometry';
import { DRAWING_COLORS, DRAWING_KINDS, STROKE_WIDTHS } from '@/lib/drawing-style';
import { useDrawingStyle, type DrawingStyleStore } from '@/stores/drawing-style-store';

export type DrawStylePanelProps = Readonly<{ drawingStyle: StoreApi<DrawingStyleStore> }>;

export const FILL_ONLY_FIXED_HINT = 'Só formas fixas têm preenchimento.';

// "Nenhum" is a radio value like the colors; the store keeps it as `null`.
const NO_FILL = 'none';
type FillChoice = DrawingColorDto | typeof NO_FILL;

const KIND_OPTIONS: readonly ChoiceOption<DrawingKind>[] = DRAWING_KINDS.map(({ kind, label }) => ({
  value: kind,
  label,
}));
const COLOR_OPTIONS: readonly ChoiceOption<DrawingColorDto>[] = DRAWING_COLORS.map(
  ({ color, label, hex }) => ({ value: color, label, swatch: hex }),
);
const FILL_OPTIONS: readonly ChoiceOption<FillChoice>[] = [
  { value: NO_FILL, label: 'Nenhum' },
  ...COLOR_OPTIONS,
];
const WIDTH_OPTIONS = STROKE_WIDTHS.map(({ width, label }) => ({ value: width, label }));

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
      className="absolute top-16 left-16 flex w-72 flex-col gap-4 rounded-lg border border-border bg-panel p-4"
    >
      <ChoiceField legend="Forma" value={kind} options={KIND_OPTIONS} onChange={actions.setKind} />
      <ChoiceField
        legend="Cor do traço"
        value={stroke}
        options={COLOR_OPTIONS}
        onChange={actions.setStroke}
      />
      <ChoiceField
        legend="Preenchimento"
        value={fill ?? NO_FILL}
        options={FILL_OPTIONS}
        onChange={(choice) => actions.setFill(choice === NO_FILL ? null : choice)}
        disabled={freehand}
        hint={freehand ? FILL_ONLY_FIXED_HINT : undefined}
      />
      <ChoiceField
        legend="Espessura"
        value={strokeWidth}
        options={WIDTH_OPTIONS}
        onChange={actions.setStrokeWidth}
      />
    </section>
  );
}
