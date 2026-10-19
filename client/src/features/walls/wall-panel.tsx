import type { WallKindDto, WallShapeKindDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import { StyleTileGroup, type StyleTile } from '@/features/drawings/style-tile-group';
import { WALL_KINDS, WALL_SHAPES } from '@/lib/wall-style';
import type { WallMode } from '@/stores/board-tool-state';
import { useWallStyle, type WallStyleStore } from '@/stores/wall-style-store';

export type WallPanelProps = Readonly<{
  wallStyle: StoreApi<WallStyleStore>;
  /** With walls selected, a kind goes to them instead of the next wall's style. */
  onKind?: (kind: WallKindDto) => void;
  /** What a press does on the board: draw, select, or erase a wall or one piece of it. */
  mode: WallMode;
  onMode: (mode: WallMode) => void;
}>;

export const DOOR_IS_STRAIGHT = 'Porta é sempre reta.';

// The line as the master sees it on the board: continuous, dashed or dotted, by what it blocks.
const KIND_PICTURE: Readonly<Record<WallKindDto, React.JSX.Element>> = {
  wall: <line x1="2" y1="8" x2="14" y2="8" />,
  grate: <line x1="2" y1="8" x2="14" y2="8" strokeDasharray="3 2" />,
  curtain: <line x1="2" y1="8" x2="14" y2="8" strokeDasharray="1 2" />,
  door: (
    <>
      <line x1="2" y1="8" x2="5" y2="8" />
      <rect x="5" y="5" width="6" height="6" fill="currentColor" fillOpacity={0.35} />
      <line x1="11" y1="8" x2="14" y2="8" />
    </>
  ),
};

const SHAPE_PICTURE: Readonly<Record<WallShapeKindDto, React.JSX.Element>> = {
  line: <line x1="2" y1="12" x2="14" y2="4" />,
  freehand: <path d="M2 11 C5 3 9 14 14 5" fill="none" />,
  rectangle: <rect x="3" y="3" width="10" height="10" fill="none" />,
  ellipse: <circle cx="8" cy="8" r="6" fill="none" />,
};

function picture(shape: React.JSX.Element): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-5"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    >
      {shape}
    </svg>
  );
}

// Desenhar a pen, the eraser box dashed, the erasers over a whole box or over one of its sides.
const MODE_TILES: readonly StyleTile<WallMode>[] = [
  {
    value: 'draw',
    label: 'Desenhar',
    picture: picture(<path d="M3 13l1-4 7-7 3 3-7 7z" fill="none" />),
  },
  {
    value: 'eraseArea',
    label: 'Apagar área',
    picture: picture(<path d="M3 3h10v10H3z" fill="none" strokeDasharray="2 2" />),
  },
  {
    value: 'eraseWall',
    label: 'Apagar parede',
    picture: picture(<path d="M3 3h10v10H3zM3 3l10 10M13 3L3 13" fill="none" />),
  },
  {
    value: 'eraseSegment',
    label: 'Apagar trecho',
    picture: picture(<path d="M3 13V3h10M13 7v6H7M10 10l-3 3" fill="none" />),
  },
];

const KIND_TILES: readonly StyleTile<WallKindDto>[] = WALL_KINDS.map(({ kind, label }) => ({
  value: kind,
  label,
  picture: picture(KIND_PICTURE[kind]),
}));

/** The walls panel, floating beside the toolbar while the walls tool is on: the action of a press,
 *  then (drawing) the kind and shape of the next wall. A door is always straight, so the other shapes switch off.
 *
 *  Example: `{tool === 'walls' && <WallPanel wallStyle={deps.wallStyle} mode={mode} onMode={setMode} />}` */
export function WallPanel({ wallStyle, onKind, mode, onMode }: WallPanelProps): React.JSX.Element {
  const kind = useWallStyle(wallStyle, (state) => state.kind);
  const shape = useWallStyle(wallStyle, (state) => state.shape);
  const actions = wallStyle.getState();
  const door = kind === 'door';
  const shapeTiles = WALL_SHAPES.map(({ shape: value, label }) => ({
    value,
    label,
    picture: picture(SHAPE_PICTURE[value]),
    disabled: door && value !== 'line',
  }));
  return (
    <section
      aria-label="Estilo da parede"
      className="absolute top-16 left-16 flex w-60 flex-col gap-4 rounded-lg border border-border bg-panel p-4"
    >
      <StyleTileGroup
        legend="Ação"
        value={mode}
        tiles={MODE_TILES}
        onChange={onMode}
        shape="square"
      />
      {mode === 'draw' ? (
        <StyleTileGroup
          legend="Tipo"
          value={kind}
          tiles={KIND_TILES}
          onChange={onKind ?? actions.setKind}
          shape="square"
        />
      ) : null}
      {mode === 'draw' ? (
        <StyleTileGroup
          legend="Forma"
          value={door ? 'line' : shape}
          tiles={shapeTiles}
          onChange={actions.setShape}
          shape="square"
          hint={door ? DOOR_IS_STRAIGHT : undefined}
        />
      ) : null}
    </section>
  );
}
