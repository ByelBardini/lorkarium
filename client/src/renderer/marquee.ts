import { boxTouches } from '@/lib/drawing-geometry';
import type { BoardView, TokenView } from './board-view';
import { CELL_WORLD_SIZE, type Point } from './camera';
import type { DrawingView } from './drawing-view';

// The same 4 px as a token press: below it the press on the empty board is a click.
const MARQUEE_THRESHOLD_PX = 4;

/** A selection rectangle being drawn: where the press started and where the pointer is, on
 *  screen (for the threshold) and in world px (for what it covers). */
export type Marquee = Readonly<{
  startScreen: Point;
  startWorld: Point;
  currentWorld: Point;
  active: boolean;
}>;

export type WorldRect = Readonly<{ x: number; y: number; width: number; height: number }>;

type PointerAt = Readonly<{ screen: Point; world: Point }>;

/** Example: `marquee = startMarquee(pointOf(event), worldOf(event))` */
export function startMarquee(screen: Point, world: Point): Marquee {
  return { startScreen: screen, startWorld: world, currentWorld: world, active: false };
}

/** The marquee after the pointer moved: it becomes a rectangle from 4 px on, and stays one.
 *
 *  Example: `marquee = moveMarquee(marquee, { screen: pointOf(event), world: worldOf(event) })` */
export function moveMarquee(marquee: Marquee, at: PointerAt): Marquee {
  const { x, y } = marquee.startScreen;
  const travelled = Math.hypot(at.screen.x - x, at.screen.y - y);
  const active = marquee.active || travelled >= MARQUEE_THRESHOLD_PX;
  return { ...marquee, currentWorld: at.world, active };
}

/** The rectangle in world px, whichever way it was dragged.
 *
 *  Example: `marqueeRect(marquee) // { x, y, width, height }, width and height ≥ 0` */
export function marqueeRect(marquee: Marquee): WorldRect {
  const { startWorld: a, currentWorld: b } = marquee;
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/** The tokens the rectangle touches (one cell of a big token is enough) among those this viewer
 *  may move on the active layer, in drawing order.
 *
 *  Example: `onIntent({ kind: 'tokensMarqueed', tokenIds: tokensInMarquee(rect, view.tokens), additive })` */
export function tokensInMarquee(rect: WorldRect, tokens: readonly TokenView[]): string[] {
  return tokens.filter((token) => token.draggable && touches(rect, token)).map(({ id }) => id);
}

/** The drawings the rectangle touches among the pickable ones (on the active layer, the
 *  viewer's own or any for the master), in drawing order.
 *
 *  Example: `onIntent({ kind: 'drawingsMarqueed', drawingIds: drawingsInMarquee(rect, view.drawings), additive })` */
export function drawingsInMarquee(rect: WorldRect, drawings: readonly DrawingView[]): string[] {
  const inCells = {
    x: rect.x / CELL_WORLD_SIZE,
    y: rect.y / CELL_WORLD_SIZE,
    width: rect.width / CELL_WORLD_SIZE,
    height: rect.height / CELL_WORLD_SIZE,
  };
  const touched = drawings.filter((view) => view.pickable && boxTouches(view.geometry, inCells));
  return touched.map(({ id }) => id);
}

/** The token a short right click opens its menu on, or `null`: the master's on any token of the
 *  active layer, a player's only on a token they may move (the empty board, someone else's
 *  token or one off the active layer open nothing).
 *
 *  Example: `const tokenId = tokenMenuTarget(view, layer.tokenAt(world))` */
export function tokenMenuTarget(
  view: Pick<BoardView, 'layerMenu'>,
  token: TokenView | null,
): string | null {
  if (!token?.pickable) return null;
  return view.layerMenu || token.draggable ? token.id : null;
}

function touches(rect: WorldRect, token: TokenView): boolean {
  const left = token.col * CELL_WORLD_SIZE;
  const top = token.row * CELL_WORLD_SIZE;
  const side = token.size * CELL_WORLD_SIZE;
  return (
    rect.x < left + side &&
    rect.x + rect.width > left &&
    rect.y < top + side &&
    rect.y + rect.height > top
  );
}
