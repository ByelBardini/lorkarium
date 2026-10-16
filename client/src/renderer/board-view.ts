import type {
  BarColorDto,
  ConditionToneDto,
  SceneDto,
  TokenDto,
  TokenSideDto,
} from '@lorkarium/contracts';
import { pathDistance, type Cell, type SceneSize } from '@lorkarium/game-core';
import { barFill, type BarFillState } from '@/lib/bar-display';
import { rulerLabel } from '@/lib/ruler-label';
import { routePath, type TokenRoute } from '@/lib/token-route';
import { CELL_WORLD_SIZE, type Point, type Size } from './camera';

/** A ruler being measured: local to this viewer, never sent to the server. */
export type RulerState = Readonly<{ from: Cell; to: Cell }>;

/** A ruler as drawn: world px through the centers it passes (two for the tool, one more per
 *  bend of a drag), and its reading. */
export type RulerView = Readonly<{ points: readonly Point[]; label: string }>;

/** The token this viewer drags and the path it traced. */
export type DragRouteView = Readonly<{ tokenId: string; route: TokenRoute }>;

/** The bar drawn under a token: always the one at position 0, when the viewer may see it. */
export type TokenBarView = Readonly<{ fraction: number; state: BarFillState; color: BarColorDto }>;

export type TokenView = Readonly<{
  id: string;
  initials: string;
  ring: TokenSideDto;
  col: number;
  row: number;
  size: number;
  bar: TokenBarView | null;
  selected: boolean;
  draggable: boolean;
  /** The token of the combatant on turn: the gold ring. */
  onTurn: boolean;
  /** Up to 3 condition marks, by tone; `moreMarks` draws a "+" past that. */
  marks: readonly ConditionToneDto[];
  moreMarks: boolean;
}>;

/** Where a move was asked for, drawn as a ghost until the server answers. */
export type GhostView = Readonly<{ tokenId: string; col: number; row: number; size: number }>;

/** Everything the renderer draws, already decided: it only turns this into pixels. */
export type BoardView = Readonly<{
  sceneSize: Size;
  grid: Readonly<{ visible: boolean; opacity: number; cells: SceneSize }>;
  ruler: RulerView | null;
  tokens: readonly TokenView[];
  ghost: GhostView | null;
  /** With the ruler, a press on a token measures from it instead of grabbing it. */
  tool: BoardViewTool;
}>;

export type BoardViewTool = 'select' | 'ruler';

export type BoardViewInput = Readonly<{
  scene: SceneDto;
  tokens: readonly TokenDto[];
  /** The "Grid" tool: hides the grid for this viewer only. */
  localGridVisible: boolean;
  ruler: RulerState | null;
  selectedTokenId: string | null;
  preview: Readonly<{ tokenId: string; col: number; row: number }> | null;
  /** This viewer's drag: the ghost on the cell it is over and the ruler of its path. */
  drag: DragRouteView | null;
  /** Where other people are dragging tokens, by id: drawn there instead of the confirmed cell. */
  dragged: Readonly<Record<string, Cell>>;
  /** Reconnecting: nothing is draggable. */
  readOnly: boolean;
  tool: BoardViewTool;
  /** The token on turn in the combat, or `null` out of combat. */
  currentTokenId: string | null;
}>;

const MAX_MARKS = 3;

/** Confirmed board + local tools → what to draw.
 *
 *  Example: `renderer.draw(buildBoardView({ scene, tokens, localGridVisible, ruler, selectedTokenId, preview, readOnly }))` */
export function buildBoardView(input: BoardViewInput): BoardView {
  const { scene } = input;
  const cells = { widthCells: scene.widthCells, heightCells: scene.heightCells };
  return {
    sceneSize: {
      width: cells.widthCells * CELL_WORLD_SIZE,
      height: cells.heightCells * CELL_WORLD_SIZE,
    },
    grid: {
      visible: scene.gridVisible && input.localGridVisible,
      opacity: scene.gridOpacity / 100,
      cells,
    },
    ruler: rulerOf(input),
    tokens: input.tokens.map((token) => tokenViewOf(token, input)),
    ghost: ghostOf(input),
    tool: input.tool,
  };
}

// The drag wins over the tool: a press on a token with the ruler measures instead of dragging.
function rulerOf({ drag, ruler, scene, tokens }: BoardViewInput): RulerView | null {
  if (drag) {
    const size = tokens.find(({ id }) => id === drag.tokenId)?.size ?? 1;
    const path = routePath(drag.route);
    return rulerAlong(path, size, scene);
  }
  return ruler && rulerAlong([ruler.from, ruler.to], 1, scene);
}

function rulerAlong(path: readonly Cell[], size: number, scene: SceneDto): RulerView {
  const half = (size * CELL_WORLD_SIZE) / 2;
  const points = path.map(({ col, row }) => ({
    x: col * CELL_WORLD_SIZE + half,
    y: row * CELL_WORLD_SIZE + half,
  }));
  return { points, label: rulerLabel(pathDistance(path), scene) };
}

function tokenViewOf(token: TokenDto, input: BoardViewInput): TokenView {
  const first = token.bars.find(({ position }) => position === 0);
  const at = input.dragged[token.id] ?? token;
  return {
    id: token.id,
    initials: token.initials,
    ring: token.side,
    col: at.col,
    row: at.row,
    size: token.size,
    bar: first ? { ...barFill(first), color: first.color } : null,
    selected: token.id === input.selectedTokenId,
    draggable: token.canControl && !input.readOnly,
    onTurn: token.id === input.currentTokenId,
    marks: token.conditions.slice(0, MAX_MARKS).map(({ tone }) => tone),
    moreMarks: token.conditions.length > MAX_MARKS,
  };
}

// While dragging, the ghost marks the cell the token would land on; then the move asked for.
function ghostOf({ drag, preview, tokens }: BoardViewInput): GhostView | null {
  const target = drag ? { tokenId: drag.tokenId, ...drag.route.current } : preview;
  if (!target) return null;
  const token = tokens.find(({ id }) => id === target.tokenId);
  return token ? { ...target, size: token.size } : null;
}
