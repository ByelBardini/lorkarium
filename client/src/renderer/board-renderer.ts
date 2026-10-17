import type { Cell } from '@lorkarium/game-core';
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
  | Readonly<{ kind: 'tokenDropped'; tokenId: string; cell: Cell | null }>;

/** What the board tells React: it never changes state itself. */
export type BoardIntent =
  Readonly<{ kind: 'cameraChanged'; zoom: number }> | BoardPointerIntent | BoardTokenIntent;

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
