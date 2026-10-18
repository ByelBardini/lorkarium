import { facingToward, facingVector, snapFacing } from '@lorkarium/game-core';
import type { BoardView, TokenView } from './board-view';
import type { Point } from './camera';
import { tokenCenterOf, tokenWorldRect } from './token-box';

/** How far past the token's edge the handle sits, in world px. */
export const HANDLE_GAP = 20;
/** How close (world px) a press must be to take the handle. */
export const HANDLE_REACH = 10;
const SHIFT_STEP = 45;

type HandleTokenView = Pick<TokenView, 'col' | 'row' | 'width' | 'height' | 'facing'>;

/** The one token that shows the handle: selected alone, and this viewer may move it. A group or
 *  a token of someone else shows none.
 *
 *  Example: `handleTokenOf(view)?.id` */
export function handleTokenOf(view: Pick<BoardView, 'tokens' | 'tool'>): TokenView | null {
  if (view.tool !== 'select') return null;
  const selected = view.tokens.filter((token) => token.selected);
  const [only] = selected;
  return selected.length === 1 && only?.draggable ? only : null;
}

/** Where the handle is drawn: always in the direction the token looks, past its edge.
 *
 *  Example: `handlePointOf(kael) // right of the center when kael looks right (0)` */
export function handlePointOf(view: HandleTokenView): Point {
  const center = tokenCenterOf(view);
  const rect = tokenWorldRect(view);
  const distance = Math.max(rect.width, rect.height) / 2 + HANDLE_GAP;
  const ahead = facingVector(view.facing);
  return { x: center.x + ahead.x * distance, y: center.y + ahead.y * distance };
}

/** The line drawn to the handle: from the token's edge (its disc, an ellipse once stretched)
 *  out to the handle, so nothing crosses the token itself.
 *
 *  Example: `const { from, to } = handleStemOf(kael)` */
export function handleStemOf(view: HandleTokenView): Readonly<{ from: Point; to: Point }> {
  const center = tokenCenterOf(view);
  const rect = tokenWorldRect(view);
  const ahead = facingVector(view.facing);
  const reach = 1 / Math.hypot(ahead.x / (rect.width / 2), ahead.y / (rect.height / 2));
  const from = { x: center.x + ahead.x * reach, y: center.y + ahead.y * reach };
  return { from, to: handlePointOf(view) };
}

/** Whether a press at `world` takes the handle of `view`.
 *
 *  Example: `if (handleAt(token, world)) startTurning()` */
export function handleAt(view: HandleTokenView, world: Point): boolean {
  const handle = handlePointOf(view);
  return Math.hypot(world.x - handle.x, world.y - handle.y) <= HANDLE_REACH;
}

/** The facing while the handle is dragged to `pointer`: toward it, snapped to 45° with Shift;
 *  over the center itself the token keeps `current`.
 *
 *  Example: `facingFromDrag(kael, { x: -40, y: 32 }, 0, false) // 90 (left)` */
export function facingFromDrag(
  view: Pick<TokenView, 'col' | 'row' | 'width' | 'height'>,
  pointer: Point,
  current: number,
  snap: boolean,
): number {
  const toward = facingToward(tokenCenterOf(view), pointer);
  if (toward === null) return current;
  return snap ? snapFacing(toward, SHIFT_STEP) : toward;
}
