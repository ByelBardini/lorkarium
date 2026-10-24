import type { LightDto, SceneDto, TokenDto, TokenLayerDto } from '@lorkarium/contracts';
import { assetUrlOf } from '@/services/assets-api';
import { pathDistance, type Cell, type SceneSize, type TokenBox } from '@lorkarium/game-core';
import type { DrawingStyle } from '@/lib/drawing-style';
import { DEFAULT_EFFECT_AREA_STYLE, type EffectAreaStyle } from '@/lib/effect-area-style';
import { DEFAULT_WALL_STYLE, wallSketchPreviewOf, type WallStyle } from '@/lib/wall-style';
import type { BoardSight } from '@/lib/board-sight';
import { rulerLabel } from '@/lib/ruler-label';
import { routePath, type TokenRoute } from '@/lib/token-route';
import { CELL_WORLD_SIZE, type Point, type Size } from './camera';
import {
  drawingViewsOf,
  type DrawMode,
  type DrawingView,
  type DrawingViewInput,
} from './drawing-view';
import {
  effectAreaViewsOf,
  type EffectAreaView,
  type EffectAreaViewInput,
} from './effect-area-view';
import type { EffectAreaSketchView } from './effect-area-gestures';
import type { TokenLanding } from '@/lib/light-sources';
import { shownCellsOf } from '@/lib/shown-cells';
import { fogViewOf, type FogView } from './fog-view';
import { lightTintViewOf, type LightTintView } from './light-tint-view';
import { lightViewsOf, type LightView } from './light-view';
import { sightConeViewOf, type SightConeView } from './sight-cone-view';
import { tokenViewsOf, type TokenView } from './token-view';
import {
  doorIconsOf,
  wallViewsOf,
  type WallMode,
  type DoorIconView,
  type WallView,
  type WallViewInput,
} from './wall-view';

export type { ConditionMarkView, TokenArtView, TokenBarView, TokenView } from './token-view';

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

/** The background image, stretched over the whole scene (world px). */
export type SceneBackgroundView = Readonly<{ url: string; width: number; height: number }>;

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
  /** Their own layer: over Fundo and Objetos, under the Tokens layer, in drawing order. */
  drawings: readonly DrawingView[];
  /** At the bottom of the Tokens layer, under the drawings and the tokens, in creation order. */
  effectAreas: readonly EffectAreaView[];
  /** The master's wall lines, above the tokens; none for a player. */
  walls: readonly WallView[];
  /** The doors this viewer may click: all for the master, the seen ones for a player. */
  doors: readonly DoorIconView[];
  /** Over the board and its tokens, under the walls and the handles; `null` with nothing hidden. */
  fog: FogView | null;
  /** What the colored lights tint on a dark scene, for every viewer: over the tokens, under the
   *  fog (which hides it where a player does not see); `null` with nothing to tint. */
  lightTint: LightTintView | null;
  /** The master's outline of the field of view of the token selected alone (`sightConeViewOf`). */
  sightCone: SightConeView | null;
  /** The master's map light icons (and, with the lights tool, what they light); none for a player. */
  lights: readonly LightView[];
  /** With the draw tool: how the sketch under the pointer looks; `null` with another tool. */
  sketch: DrawingStyle | null;
  /** With the area tool: the shape and color of the next area; `null` with another tool. */
  effectAreaSketch: EffectAreaSketchView | null;
  /** With the walls tool: a line is sketched straight, from the press to the pointer. */
  sketchStraight: boolean;
  /** What a press does with the walls tool. */
  wallMode: WallMode;
  /** What a press does with the draw tool. */
  drawMode: DrawMode;
  /** With the ruler, a press on a token measures from it instead of grabbing it. */
  tool: BoardViewTool;
  /** A short right click on a token opens "Mover para camada" (only the master). */
  layerMenu: boolean;
}>;

export type BoardViewTool =
  'select' | 'ruler' | 'draw' | 'area' | 'walls' | 'lights' | 'conditions';

/** The walls and what this viewer does to them; absent = none (most specs). */
type WallBoardInput = Partial<Pick<WallViewInput, 'walls' | 'selectedWallIds' | 'seenDoorIds'>> &
  Readonly<{
    /** Absent: Desenhar. */
    wallMode?: WallMode;
    /** Absent: Desenhar. */
    drawMode?: DrawMode;
    /** What this viewer sees (absent: everything): hidden tokens are not drawn, the penumbra
     *  ones are silhouettes, and only the seen doors show. */
    sight?: BoardSight;
  }>;

/** The areas of effect and what this viewer does to them; absent = none (most specs). */
type EffectAreaBoardInput = Partial<
  Pick<EffectAreaViewInput, 'effectAreas' | 'selectedEffectAreaIds' | 'effectAreaPreview'> &
    Readonly<{ effectAreaStyle: EffectAreaStyle }>
>;

export type BoardViewInput = Omit<DrawingViewInput, 'picking' | 'readOnly'> &
  EffectAreaBoardInput &
  WallBoardInput &
  Readonly<{
    /** The style of the next drawing, shown on the sketch while the draw tool is on. */
    drawingStyle: DrawingStyle;
    /** The kind and shape of the next wall, sketched while the walls tool is on (absent: Parede, Reta). */
    wallStyle?: WallStyle;
    /** The map lights: they open the fog where an eye sees what they light. */
    lights?: readonly LightDto[];
    /** The master's map lights picked with the lights tool. */
    selectedLightIds?: readonly string[];
    /** Where this viewer drags lights, until the server answers, by id. */
    lightPreview?: Readonly<Record<string, Readonly<{ x: number; y: number }>>>;
    /** Where this viewer aims spotlights by the handle, until the server answers, by id. */
    lightAimPreview?: Readonly<Record<string, number>>;
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
    /** The tokens of the entry on turn in the combat; none out of combat. */
    currentTokenIds: readonly string[];
  }>;

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
    tokens: tokenViewsOf(input),
    ghosts: ghostsOf(input),
    drawings: drawingViewsOf({ ...input, picking: pickingDrawings(input) }),
    effectAreas: effectAreaViewsOf({
      ...input,
      effectAreas: input.effectAreas ?? [],
      selectedEffectAreaIds: input.selectedEffectAreaIds ?? [],
      effectAreaPreview: input.effectAreaPreview ?? {},
    }),
    ...wallsOf(input),
    fog: fogOf(input),
    lightTint: lightTintViewOf({
      scene,
      walls: input.walls ?? [],
      lights: aimedLightsOf(input),
      tokens: input.tokens,
      landing: landingOf(input),
    }),
    sightCone: sightConeViewOf({
      viewer: input.viewer,
      scene,
      tokens: input.tokens,
      walls: input.walls ?? [],
      selectedTokenIds: input.selectedTokenIds,
      landing: landingOf(input),
    }),
    lights: lightViewsOf({
      lights: previewedLightsOf(input),
      walls: input.walls ?? [],
      scene: cells,
      viewer: input.viewer,
      tool: input.tool,
      selectedLightIds: input.selectedLightIds ?? [],
    }),
    sketch: sketchStyleOf(input),
    sketchStraight: input.tool === 'walls' && !erasingArea(input) && wallPreviewOf(input).straight,
    wallMode: input.wallMode ?? 'draw',
    drawMode: input.drawMode ?? 'draw',
    effectAreaSketch: effectAreaSketchOf(input),
    tool: input.tool,
    layerMenu: input.canChooseLayer,
  };
}

function pickingDrawings(input: BoardViewInput): boolean {
  return input.tool === 'draw' && input.drawMode === 'select';
}

// A light dragged here is drawn where it goes, and aimed where its handle points, before the
// server confirms it.
function previewedLightsOf(input: BoardViewInput): readonly LightDto[] {
  const preview = input.lightPreview ?? {};
  return aimedLightsOf(input).map((light) => ({ ...light, ...preview[light.id] }));
}

// The tint follows the handle too: the master sees the spotlight's color turn with it.
function aimedLightsOf(input: BoardViewInput): readonly LightDto[] {
  const aim = input.lightAimPreview ?? {};
  return (input.lights ?? []).map((light) => {
    const facing = aim[light.id];
    return facing === undefined ? light : { ...light, facing };
  });
}

// The fog follows the tokens where they show: their eyes look from there.
function fogOf(input: BoardViewInput): FogView | null {
  if (!input.sight) return null;
  const { sight, scene, tokens } = input;
  const walls = input.walls ?? [];
  const landing = landingOf(input);
  return fogViewOf({ sight, scene, tokens, walls, lights: input.lights ?? [], landing });
}

// Where each token shows now and where it looks (this viewer's drag, the move waiting for the
// server, other people's drags, a turn before the ack): its eyes and lights follow it.
function landingOf(input: BoardViewInput): TokenLanding {
  const { dragged, drag, preview, facingPreview, tokens } = input;
  return shownCellsOf({ dragged, drag, preview, facingPreview, tokens });
}

function wallsOf(input: BoardViewInput): Pick<BoardView, 'walls' | 'doors'> {
  const walls: WallViewInput = {
    walls: input.walls ?? [],
    viewer: input.viewer,
    tool: input.tool,
    selectedWallIds: input.selectedWallIds ?? [],
    seenDoorIds: input.seenDoorIds ?? input.sight?.seenDoorIds ?? null,
  };
  return { walls: wallViewsOf(walls), doors: doorIconsOf(walls) };
}

// The walls tool sketches with the draw gestures, in a thin gold line.
// The eraser box shows as a thin ember outline, apart from the gold of a new wall.
const ERASER_SKETCH: DrawingStyle = {
  kind: 'rectangle',
  stroke: 'ember',
  fill: null,
  strokeWidth: 'thin',
};

function erasingArea(input: BoardViewInput): boolean {
  return input.tool === 'walls' && input.wallMode === 'eraseArea';
}

function sketchStyleOf(input: BoardViewInput): DrawingStyle | null {
  if (input.tool === 'draw') return input.drawingStyle;
  if (erasingArea(input)) return ERASER_SKETCH;
  return input.tool === 'walls' ? wallPreviewOf(input).drawing : null;
}

function wallPreviewOf(input: BoardViewInput): ReturnType<typeof wallSketchPreviewOf> {
  return wallSketchPreviewOf(input.wallStyle ?? DEFAULT_WALL_STYLE);
}

function effectAreaSketchOf(input: BoardViewInput): EffectAreaSketchView | null {
  if (input.tool !== 'area') return null;
  const { cellDistance, cellUnit } = input.scene;
  return {
    style: input.effectAreaStyle ?? DEFAULT_EFFECT_AREA_STYLE,
    distance: { cellDistance, cellUnit },
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

// While dragging, a ghost where each member would land; then the moves asked for.
function ghostsOf({ drag, preview, tokens }: BoardViewInput): GhostView[] {
  const targets = drag ? (drag.landing ?? []) : preview;
  return targets.flatMap(({ tokenId, col, row }) => {
    const token = tokens.find(({ id }) => id === tokenId);
    return token ? [{ tokenId, col, row, width: token.width, height: token.height }] : [];
  });
}
