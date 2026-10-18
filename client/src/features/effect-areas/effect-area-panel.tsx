import type { EffectAreaKindDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import { COLOR_TILES } from '@/features/drawings/color-tiles';
import { StyleTileGroup, type StyleTile } from '@/features/drawings/style-tile-group';
import { EFFECT_AREA_KINDS } from '@/lib/effect-area-style';
import { useEffectAreaStyle, type EffectAreaStyleStore } from '@/stores/effect-area-style-store';

export type EffectAreaPanelProps = Readonly<{ effectAreaStyle: StoreApi<EffectAreaStyleStore> }>;

// Grid shapes have stepped edges (they paint whole cells); the smooth ones are plain curves.
const KIND_PICTURE: Readonly<Record<EffectAreaKindDto, React.JSX.Element>> = {
  square: <rect x="3" y="3" width="10" height="10" />,
  circle: (
    <polygon points="6,2 10,2 10,4 12,4 12,6 14,6 14,10 12,10 12,12 10,12 10,14 6,14 6,12 4,12 4,10 2,10 2,6 4,6 4,4 6,4" />
  ),
  semicircle: <polygon points="6,2 8,2 8,4 10,4 10,6 12,6 12,10 10,10 10,12 8,12 8,14 6,14" />,
  orthogonal_cone: <polygon points="2,7 6,7 6,5 10,5 10,3 14,3 14,13 10,13 10,11 6,11 6,9 2,9" />,
  diagonal_cone: <polygon points="2,2 14,2 14,6 12,6 12,10 10,10 10,12 6,12 6,14 2,14" />,
  line: <rect x="2" y="6.5" width="12" height="3" />,
  emanation: (
    <>
      <rect x="2" y="2" width="12" height="12" rx="3" />
      <rect x="6" y="6" width="4" height="4" />
    </>
  ),
  smooth_circle: <circle cx="8" cy="8" r="6" />,
  smooth_semicircle: <path d="M6 2 A6 6 0 0 1 6 14 Z" />,
};

const KIND_TILES: readonly StyleTile<EffectAreaKindDto>[] = EFFECT_AREA_KINDS.map(
  ({ kind, label }) => ({
    value: kind,
    label,
    picture: (
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="size-5"
        fill="currentColor"
        fillOpacity={0.35}
        stroke="currentColor"
        strokeWidth={1}
      >
        {KIND_PICTURE[kind]}
      </svg>
    ),
  }),
);

/** The style of the next area of effect, floating beside the toolbar while the area tool is on:
 *  the shape and its color. Remembered in the browser.
 *
 *  Example: `{tool === 'area' && <EffectAreaPanel effectAreaStyle={deps.effectAreaStyle} />}` */
export function EffectAreaPanel({ effectAreaStyle }: EffectAreaPanelProps): React.JSX.Element {
  const kind = useEffectAreaStyle(effectAreaStyle, (state) => state.kind);
  const color = useEffectAreaStyle(effectAreaStyle, (state) => state.color);
  const actions = effectAreaStyle.getState();
  return (
    <section
      aria-label="Estilo da área"
      className="absolute top-16 left-16 flex w-60 flex-col gap-4 rounded-lg border border-border bg-panel p-4"
    >
      <StyleTileGroup
        legend="Forma"
        value={kind}
        tiles={KIND_TILES}
        onChange={actions.setKind}
        shape="grid"
      />
      <StyleTileGroup
        legend="Cor"
        value={color}
        tiles={COLOR_TILES}
        onChange={actions.setColor}
        shape="round"
      />
    </section>
  );
}
