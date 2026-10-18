import type { EffectAreaShapeDto } from '@lorkarium/contracts';
import type { Cell, TokenBox } from '@lorkarium/game-core';
import type { CellPoint } from '@/lib/drawing-geometry';
import type { BoardView } from './board-view';

/** A primary-button pointer step over the board, in cells (`null` off the scene). The renderer
 *  only reports it; what it means (measure, select, drag) is decided outside, by the tool. */
export type BoardPointerIntent = Readonly<{
  kind: 'pointerDown' | 'pointerMove' | 'pointerUp';
  cell: Cell | null;
}>;

/** A token clicked (selected; with Shift, `additive` toggles it in the selection), dragged over
 *  a new cell (from its confirmed `origin`), dragged and then put back by Esc, or released over
 *  a cell. `cell` is `null` off the scene. A marquee names the pickable tokens it touched. */
export type BoardTokenIntent =
  | Readonly<{ kind: 'tokenPicked'; tokenId: string; additive: boolean }>
  | Readonly<{ kind: 'tokensMarqueed'; tokenIds: readonly string[]; additive: boolean }>
  /** A short right click on a token, with the menu allowed: where (viewport px) to open it. */
  | Readonly<{ kind: 'tokenMenuRequested'; tokenId: string; x: number; y: number }>
  | Readonly<{ kind: 'tokenDragged'; tokenId: string; origin: Cell; cell: Cell | null }>
  | Readonly<{ kind: 'tokenDragCancelled'; tokenId: string }>
  | Readonly<{ kind: 'tokenDropped'; tokenId: string; cell: Cell | null }>
  /** The handle being dragged points the token at `facing` (`null`: let go by Esc). */
  | Readonly<{ kind: 'tokenFacingPreviewed'; tokenId: string; facing: number | null }>
  /** The handle released: where the token should look now. */
  | Readonly<{ kind: 'tokenFaced'; tokenId: string; facing: number }>
  /** A resize handle being dragged gives the token `box` (`null`: let go by Esc). */
  | Readonly<{ kind: 'tokenResizePreviewed'; tokenId: string; box: TokenBox | null }>
  /** A resize handle released: the box the token should have now. */
  | Readonly<{ kind: 'tokenResized'; tokenId: string; box: TokenBox }>;

/** A drawing clicked (Shift: `additive` toggles it), the drawings a marquee touched, the
 *  drawings dropped after a drag (by `dx, dy` cells; `anchorId` is the one under the pointer),
 *  and a sketch of the draw tool finished (its pointer points in cells, `snap` = Shift). */
export type BoardDrawingIntent =
  | Readonly<{ kind: 'drawingPicked'; drawingId: string; additive: boolean }>
  | Readonly<{ kind: 'drawingsMarqueed'; drawingIds: readonly string[]; additive: boolean }>
  | Readonly<{
      kind: 'drawingsDropped';
      anchorId: string;
      drawingIds: readonly string[];
      /** The selected areas of effect carried with them (an area dragged is the anchor too). */
      effectAreaIds?: readonly string[];
      dx: number;
      dy: number;
    }>
  | Readonly<{ kind: 'sketchFinished'; points: readonly CellPoint[]; snap: boolean }>;

/** An area of effect drawn by the area tool and released (the shape to create), clicked
 *  (Shift: `additive` toggles it), or touched by a marquee. */
export type BoardEffectAreaIntent =
  | Readonly<{ kind: 'effectAreaSketched'; shape: EffectAreaShapeDto }>
  | Readonly<{ kind: 'effectAreaPicked'; effectAreaId: string; additive: boolean }>
  | Readonly<{ kind: 'effectAreasMarqueed'; effectAreaIds: readonly string[]; additive: boolean }>
  /** A handle being dragged on an area gives it `shape` (`null`: let go by Esc). */
  | Readonly<{
      kind: 'effectAreaReshapePreviewed';
      effectAreaId: string;
      shape: EffectAreaShapeDto | null;
    }>
  /** A handle released on an area: the shape it should have now. */
  | Readonly<{ kind: 'effectAreaReshaped'; effectAreaId: string; shape: EffectAreaShapeDto }>;

/** The cell under the pointer while it hovers the board (`null` once it leaves): where a paste
 *  lands. */
export type BoardHoverIntent = Readonly<{ kind: 'pointerHovered'; cell: Cell | null }>;

/** What the board tells React: it never changes state itself. */
export type BoardIntent =
  | Readonly<{ kind: 'cameraChanged'; zoom: number }>
  | BoardPointerIntent
  | BoardTokenIntent
  | BoardDrawingIntent
  | BoardEffectAreaIntent
  | BoardHoverIntent;

export type BoardIntentListener = (intent: BoardIntent) => void;

/** The board on a canvas: React hands it a host element and a `BoardView`, and hears intents.
 *  PixiJS lives only behind this interface (`pixi-board-renderer.ts`).
 *
 *  Example: `const renderer = createBoardRenderer(onIntent); await renderer.mount(host); renderer.draw(view)` */
export interface BoardRenderer {
  /** Rejects when the browser cannot open a WebGL/canvas context. */
  mount(host: HTMLElement): Promise<void>;
  draw(view: BoardView): void;
  zoomBy(factor: number): void;
  fitScene(): void;
  /** The cell at the center of the view (where a new token goes), or `null` off the scene. */
  viewCenterCell(): Cell | null;
  /** Brings `cell` to the middle of the view when it is off screen (a row picked in the panel). */
  centerOn(cell: Cell): void;
  /** Safe at any time, even before `mount` resolves. */
  destroy(): void;
}

export type CreateBoardRenderer = (onIntent: BoardIntentListener) => BoardRenderer;
