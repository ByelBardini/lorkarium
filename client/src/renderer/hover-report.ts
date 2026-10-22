import type { Cell } from '@lorkarium/game-core';
import type { BoardIntentListener, ScreenRect } from './board-renderer';
import { worldToScreen, type Camera } from './camera';
import { tokenWorldRect, type TokenFootprint } from './token-box';

/** The token under the pointer and where it is drawn, in viewport px. */
export type HoveredToken = Readonly<{ tokenId: string; rect: ScreenRect }>;

/** Where the pointer hovers, as the renderer samples it on every move. */
export type HoverSample = Readonly<{
  /** The cell under the pointer, `null` off the scene. */
  cell: Cell | null;
  /** A button is held: that is a drag or a marquee, not a hover. */
  pressed: boolean;
  /** The pickable token on top under the pointer. */
  token: HoveredToken | null;
}>;

/** Turns the pointer moves into hover intents: only a new cell or a new token is news (the
 *  pointer moves many times inside one), and nothing while a button is held. A camera that moves
 *  lets go of the token: its rectangle on the screen is stale.
 *
 *  Example: `hover.moved({ cell: cellAtWorld(cells, world), pressed: event.buttons !== 0, token })` */
export class HoverReport {
  private cellKey: string | null = null;
  private tokenId: string | null = null;
  private lastCamera: Camera | null = null;

  constructor(private readonly onIntent: BoardIntentListener) {}

  moved(sample: HoverSample): void {
    if (sample.pressed) return;
    this.reportCell(sample.cell);
    this.reportToken(sample.token);
  }

  /** The pointer left the board. */
  left(): void {
    this.reportCell(null);
    this.reportToken(null);
  }

  /** The camera after every change; the same camera again (a redraw) changes nothing. */
  camera(next: Camera): void {
    const before = this.lastCamera;
    this.lastCamera = next;
    const same =
      before?.zoom === next.zoom &&
      before.offsetX === next.offsetX &&
      before.offsetY === next.offsetY;
    if (before && !same) this.reportToken(null);
  }

  private reportCell(over: Cell | null): void {
    const key = over ? `${over.col},${over.row}` : 'off';
    if (key === this.cellKey) return;
    this.cellKey = key;
    this.onIntent({ kind: 'pointerHovered', cell: over });
  }

  private reportToken(token: HoveredToken | null): void {
    const tokenId = token?.tokenId ?? null;
    if (tokenId === this.tokenId) return;
    this.tokenId = tokenId;
    this.onIntent({ kind: 'tokenHovered', tokenId, rect: token?.rect ?? null });
  }
}

/** Where a token is drawn in the page: its world rectangle through the camera, moved by where the
 *  canvas sits in the viewport.
 *
 *  Example: `tokenScreenRect(token, camera, canvas.getBoundingClientRect())` */
export function tokenScreenRect(
  token: TokenFootprint,
  camera: Camera,
  canvasOrigin: Readonly<{ left: number; top: number }>,
): ScreenRect {
  const world = tokenWorldRect(token);
  const corner = worldToScreen(camera, world);
  return {
    x: canvasOrigin.left + corner.x,
    y: canvasOrigin.top + corner.y,
    width: world.width * camera.zoom,
    height: world.height * camera.zoom,
  };
}
