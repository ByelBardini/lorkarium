import type { EffectAreaShapeDto } from '@lorkarium/contracts';
import type { Cell, TokenBox } from '@lorkarium/game-core';
import type { CellPoint } from '@/lib/drawing-geometry';
import type { BoardView } from './board-view';
import type { SpeechBalloon } from './speech-balloon';

export type { SpeechBalloon } from './speech-balloon';

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

/** A wall of the master clicked with the walls tool (Shift: `additive` toggles it), or the
 *  walls dragged and dropped by `dx, dy` cells. */
export type BoardWallIntent =
  | Readonly<{ kind: 'wallPicked'; wallId: string; additive: boolean }>
  | Readonly<{ kind: 'wallErased'; wallId: string; segmentIndex: number | null }>;

/** The icon of a door this viewer sees, clicked (open or close it), or right clicked by the
 *  master (the door menu at `x, y` viewport px). */
export type BoardDoorIntent =
  | Readonly<{ kind: 'doorPressed'; wallId: string }>
  | Readonly<{ kind: 'doorMenuRequested'; wallId: string; x: number; y: number }>;

/** The lights tool: a click on the empty board puts a light at `x, y` (fractional cells); a click
 *  on an icon picks it (Shift: `additive` toggles it); a drag shows where it goes (`point: null`
 *  puts it back) and drops it there; the handle of a spotlight shows where it would point
 *  (`facing: null` lets go) and aims it on release. The master's right click on an icon, with any tool, asks for
 *  the light menu at `x, y` viewport px. */
export type BoardLightIntent =
  | Readonly<{ kind: 'lightPlaced'; x: number; y: number }>
  | Readonly<{ kind: 'lightPicked'; lightId: string; additive: boolean }>
  | Readonly<{
      kind: 'lightMovePreviewed';
      lightId: string;
      point: Readonly<{ x: number; y: number }> | null;
    }>
  | Readonly<{ kind: 'lightDropped'; lightId: string; x: number; y: number }>
  | Readonly<{ kind: 'lightAimPreviewed'; lightId: string; facing: number | null }>
  | Readonly<{ kind: 'lightAimed'; lightId: string; facing: number }>
  | Readonly<{ kind: 'lightMenuRequested'; lightId: string; x: number; y: number }>;

/** The condition tool pressed on a token this viewer sees: apply the picked condition, or with
 *  Shift (`removes`) take it off. */
export type BoardConditionIntent = Readonly<{
  kind: 'conditionStamped';
  tokenId: string;
  removes: boolean;
}>;

/** A rectangle in viewport px (what `getBoundingClientRect` speaks). */
export type ScreenRect = Readonly<{ x: number; y: number; width: number; height: number }>;

/** The cell under the pointer while it hovers the board (`null` once it leaves): where a paste
 *  lands. And the pickable token under it, with where it is drawn (`null`: none, the pointer
 *  left, a button went down or the camera moved). */
export type BoardHoverIntent =
  | Readonly<{ kind: 'pointerHovered'; cell: Cell | null }>
  | Readonly<{ kind: 'tokenHovered'; tokenId: string | null; rect: ScreenRect | null }>;

/** Alt + click (any tool) or the primary button held still for 500 ms (Selecionar): point at
 *  `x, y` (fractional cells) for everyone on this grid. */
export type BoardPingIntent = Readonly<{ kind: 'pingRequested'; x: number; y: number }>;

/** What the board tells React: it never changes state itself. */
export type BoardIntent =
  | Readonly<{ kind: 'cameraChanged'; zoom: number }>
  | BoardPingIntent
  | BoardPointerIntent
  | BoardTokenIntent
  | BoardDrawingIntent
  | BoardEffectAreaIntent
  | BoardWallIntent
  | BoardDoorIntent
  | BoardLightIntent
  | BoardConditionIntent
  | BoardHoverIntent;

export type BoardIntentListener = (intent: BoardIntent) => void;

/** One ping to show: where (fractional cells), whose name and which color (`MEMBER_COLOR_HEX`). */
export type PingMark = Readonly<{ x: number; y: number; label: string; color: number }>;

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
  /** A ring growing and fading for 3 s at the point, with the name; an arrow on the edge while it
   *  is off screen. Up to 30 at once. */
  showPing(ping: PingMark): void;
  /** The lines said as tokens on the Mesa: each hangs in a balloon over its token for 4.5 s
   *  from `shownAt` (cut at 80 characters), the newest of a token replacing the older, only on
   *  grid `sceneId` and only over a token this viewer sees. Replaces the whole list on each call
   *  (old lines fall out alone); nothing is drawn until the next frame. */
  showSpeech(sceneId: string, balloons: readonly SpeechBalloon[]): void;
  /** Safe at any time, even before `mount` resolves. */
  destroy(): void;
}

export type CreateBoardRenderer = (onIntent: BoardIntentListener) => BoardRenderer;
