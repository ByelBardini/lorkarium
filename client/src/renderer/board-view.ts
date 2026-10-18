import type {
  BarColorDto,
  ConditionIconDto,
  ConditionToneDto,
  SceneDto,
  TokenDto,
  TokenFrameDto,
  TokenLayerDto,
  TokenSideDto,
} from '@lorkarium/contracts';
import { assetUrlOf } from '@/services/assets-api';
import { pathDistance, type Cell, type SceneSize, type TokenBox } from '@lorkarium/game-core';
import { barFill, type BarFillState } from '@/lib/bar-display';
import type { DrawingStyle } from '@/lib/drawing-style';
import { rulerLabel } from '@/lib/ruler-label';
import { routePath, type TokenRoute } from '@/lib/token-route';
import { CELL_WORLD_SIZE, type Point, type Size } from './camera';
import { drawingViewsOf, type DrawingView, type DrawingViewInput } from './drawing-view';

/** A ruler being measured: local to this viewer, never sent to the server. */
export type RulerState = Readonly<{ from: Cell; to: Cell }>;

/** A ruler as drawn: world px through the centers it passes (two for the tool, one more per
 *  bend of a drag), and its reading. */
export type RulerView = Readonly<{ points: readonly Point[]; label: string }>;

/** The group this viewer drags: the anchor's path, and where each member would land (`null`:
 *  one would leave the scene, so there is nowhere to show). */
export type DragRouteView = Readonly<{
  anchorId: string;
  route: TokenRoute;
  landing: readonly Readonly<{ tokenId: string; col: number; row: number }>[] | null;
}>;

/** The image of a token; `null` keeps the initials disc. Not a secret: every viewer gets it. */
export type TokenArtView = Readonly<{
  url: string;
  frame: TokenFrameDto;
  flipX: boolean;
  flipY: boolean;
}>;

/** The background image, stretched over the whole scene (world px). */
export type SceneBackgroundView = Readonly<{ url: string; width: number; height: number }>;

/** The bar drawn under a token: always the one at position 0, when the viewer may see it. */
export type TokenBarView = Readonly<{ fraction: number; state: BarFillState; color: BarColorDto }>;

export type TokenView = Readonly<{
  id: string;
  /** Shown under the token, to everyone, while it is hovered or selected. */
  name: string;
  initials: string;
  ring: TokenSideDto;
  col: number;
  row: number;
  width: number;
  height: number;
  bar: TokenBarView | null;
  layer: TokenLayerDto;
  /** On the active layer: a click or a marquee may take it. */
  pickable: boolean;
  selected: boolean;
  draggable: boolean;
  /** The token of the combatant on turn: the gold ring. */
  onTurn: boolean;
  /** Up to 3 condition icons in their tone; `moreMarks` counts the rest, drawn as "+N". */
  marks: readonly ConditionMarkView[];
  moreMarks: number;
  art: TokenArtView | null;
  /** Where it looks (0 = right, clockwise): the image and the mark on the border turn with it. */
  facing: number;
  /** The mark on the border: only creatures (tokens layer) look somewhere; a chest just turns. */
  facingMark: boolean;
}>;

/** A condition drawn on a token: its icon in its tone's color. */
export type ConditionMarkView = Readonly<{ icon: ConditionIconDto; tone: ConditionToneDto }>;

/** Where a move was asked for, drawn as a ghost until the server answers. */
export type GhostView = Readonly<{
  tokenId: string;
  col: number;
  row: number;
  width: number;
  height: number;
}>;

/** Everything the renderer draws, already decided: it only turns this into pixels. */
export type BoardView = Readonly<{
  sceneSize: Size;
  /** Under the grid; `null` without a background. */
  background: SceneBackgroundView | null;
  grid: Readonly<{ visible: boolean; opacity: number; cells: SceneSize }>;
  ruler: RulerView | null;
  tokens: readonly TokenView[];
  ghosts: readonly GhostView[];
  /** Under the tokens of each layer, in drawing order. */
  drawings: readonly DrawingView[];
  /** With the draw tool: how the sketch under the pointer looks; `null` with another tool. */
  sketch: DrawingStyle | null;
  /** With the ruler, a press on a token measures from it instead of grabbing it. */
  tool: BoardViewTool;
  /** A short right click on a token opens "Mover para camada" (only the master). */
  layerMenu: boolean;
}>;

export type BoardViewTool = 'select' | 'ruler' | 'draw';

export type BoardViewInput = Omit<DrawingViewInput, 'activeLayer' | 'readOnly'> &
  Readonly<{
    /** The style of the next drawing, shown on the sketch while the draw tool is on. */
    drawingStyle: DrawingStyle;
  }> &
  Readonly<{
    scene: SceneDto;
    tokens: readonly TokenDto[];
    /** The "Grid" tool: hides the grid for this viewer only. */
    localGridVisible: boolean;
    ruler: RulerState | null;
    selectedTokenIds: readonly string[];
    activeLayer: TokenLayerDto;
    /** The master: picks the active layer and moves tokens between layers. */
    canChooseLayer: boolean;
    preview: readonly Readonly<{ tokenId: string; col: number; row: number }>[];
    /** A turn of this viewer waiting for the server, by token id: drawn with it already. */
    facingPreview: Readonly<Record<string, number>>;
    /** A resize of this viewer waiting for the server (or being dragged), by token id. */
    resizePreview: Readonly<Record<string, TokenBox>>;
    /** This viewer's drag: a ghost where each member would land and the ruler of its path. */
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
 *  Example: `renderer.draw(buildBoardView({ scene, tokens, selectedTokenIds, activeLayer, … }))` */
export function buildBoardView(input: BoardViewInput): BoardView {
  const { scene } = input;
  const cells = { widthCells: scene.widthCells, heightCells: scene.heightCells };
  return {
    sceneSize: {
      width: cells.widthCells * CELL_WORLD_SIZE,
      height: cells.heightCells * CELL_WORLD_SIZE,
    },
    background: backgroundOf(scene),
    grid: {
      visible: scene.gridVisible && input.localGridVisible,
      opacity: scene.gridOpacity / 100,
      cells,
    },
    ruler: rulerOf(input),
    tokens: inDrawingOrder(input.tokens).map((token) => tokenViewOf(token, input)),
    ghosts: ghostsOf(input),
    drawings: drawingViewsOf(input),
    sketch: input.tool === 'draw' ? input.drawingStyle : null,
    tool: input.tool,
    layerMenu: input.canChooseLayer,
  };
}

type TokenSizeOf = Readonly<{ width: number; height: number }>;
const ONE_CELL: TokenSizeOf = { width: 1, height: 1 };

// The drag wins over the tool: a press on a token with the ruler measures instead of dragging.
function rulerOf({ drag, ruler, scene, tokens }: BoardViewInput): RulerView | null {
  if (drag) {
    const anchor = tokens.find(({ id }) => id === drag.anchorId) ?? ONE_CELL;
    const path = routePath(drag.route);
    return rulerAlong(path, anchor, scene);
  }
  return ruler && rulerAlong([ruler.from, ruler.to], ONE_CELL, scene);
}

function rulerAlong(path: readonly Cell[], size: TokenSizeOf, scene: SceneDto): RulerView {
  const points = path.map(({ col, row }) => ({
    x: (col + size.width / 2) * CELL_WORLD_SIZE,
    y: (row + size.height / 2) * CELL_WORLD_SIZE,
  }));
  return { points, label: rulerLabel(pathDistance(path), scene) };
}

function tokenViewOf(token: TokenDto, input: BoardViewInput): TokenView {
  const first = token.bars.find(({ position }) => position === 0);
  const box = input.resizePreview[token.id];
  const at = box ?? input.dragged[token.id] ?? token;
  const pickable = token.layer === input.activeLayer;
  return {
    id: token.id,
    name: token.name,
    initials: token.initials,
    ring: token.side,
    col: at.col,
    row: at.row,
    width: box?.width ?? token.width,
    height: box?.height ?? token.height,
    bar: first ? { ...barFill(first), color: first.color } : null,
    layer: token.layer,
    pickable,
    selected: input.selectedTokenIds.includes(token.id),
    draggable: pickable && token.canControl && !input.readOnly,
    onTurn: token.id === input.currentTokenId,
    marks: token.conditions.slice(0, MAX_MARKS).map(({ icon, tone }) => ({ icon, tone })),
    moreMarks: Math.max(0, token.conditions.length - MAX_MARKS),
    art: artOf(token),
    facing: input.facingPreview[token.id] ?? token.facing,
    facingMark: token.layer === 'tokens',
  };
}

function artOf(token: TokenDto): TokenArtView | null {
  if (token.imageAssetId === null) return null;
  const { frame, flipX, flipY } = token;
  return { url: assetUrlOf(token.imageAssetId), frame, flipX, flipY };
}

// Stretched to the cells, whatever the image's own proportion (the lock decided that before).
function backgroundOf(scene: SceneDto): SceneBackgroundView | null {
  if (!scene.background) return null;
  return {
    url: assetUrlOf(scene.background.assetId),
    width: scene.widthCells * CELL_WORLD_SIZE,
    height: scene.heightCells * CELL_WORLD_SIZE,
  };
}

/** Every image url a view draws: the background and each token with art (the texture cache
 *  keeps these and unloads the rest).
 *
 *  Example: `textures.retain(imageUrlsOf(view))` */
export function imageUrlsOf(view: Pick<BoardView, 'background' | 'tokens'>): ReadonlySet<string> {
  const urls = new Set<string>();
  if (view.background) urls.add(view.background.url);
  for (const token of view.tokens) if (token.art) urls.add(token.art.url);
  return urls;
}

// Bottom first: what is drawn later covers it. `toSorted` keeps the list order inside a layer.
const DRAWING_RANK: Readonly<Record<TokenLayerDto, number>> = {
  background: 0,
  objects: 1,
  tokens: 2,
};

function inDrawingOrder(tokens: readonly TokenDto[]): TokenDto[] {
  return tokens.toSorted((a, b) => DRAWING_RANK[a.layer] - DRAWING_RANK[b.layer]);
}

// While dragging, a ghost where each member would land; then the moves asked for.
function ghostsOf({ drag, preview, tokens }: BoardViewInput): GhostView[] {
  const targets = drag ? (drag.landing ?? []) : preview;
  return targets.flatMap(({ tokenId, col, row }) => {
    const token = tokens.find(({ id }) => id === tokenId);
    return token ? [{ tokenId, col, row, width: token.width, height: token.height }] : [];
  });
}
