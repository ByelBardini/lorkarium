import type { Cell } from '@lorkarium/game-core';
import type { BoardView } from './board-view';

/** A primary-button pointer step over the board, in cells (`null` off the scene). The renderer
 *  only reports it; what it means (measure, select, drag) is decided outside, by the tool. */
export type BoardPointerIntent = Readonly<{
  kind: 'pointerDown' | 'pointerMove' | 'pointerUp';
  cell: Cell | null;
}>;

/** A token clicked (selected) or dragged and released over a cell (`null` off the scene). */
export type BoardTokenIntent =
  | Readonly<{ kind: 'tokenPicked'; tokenId: string }>
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
