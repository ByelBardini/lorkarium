import type { TokenView } from './board-view';
import { CELL_WORLD_SIZE, type Point } from './camera';

/** Where a token stands and how much it covers, in cells. */
export type TokenFootprint = Pick<TokenView, 'col' | 'row' | 'width' | 'height'>;

/** A token's rectangle in world px. */
export type WorldRect = Readonly<{ x: number; y: number; width: number; height: number }>;

/** The token's rectangle in world px, from its top-left corner.
 *
 *  Example: `tokenWorldRect({ col: 1, row: 2, width: 2, height: 1 }) // { x: 64, y: 128, width: 128, height: 64 }` */
export function tokenWorldRect(view: TokenFootprint): WorldRect {
  return {
    x: view.col * CELL_WORLD_SIZE,
    y: view.row * CELL_WORLD_SIZE,
    width: view.width * CELL_WORLD_SIZE,
    height: view.height * CELL_WORLD_SIZE,
  };
}

/** The center of a token, in world px.
 *
 *  Example: `tokenCenterOf({ col: 0, row: 0, width: 2, height: 1 }) // { x: 64, y: 32 }` */
export function tokenCenterOf(view: TokenFootprint): Point {
  const rect = tokenWorldRect(view);
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** Whether a world point falls inside the token (the far edges belong to the next one).
 *
 *  Example: `if (tokenContains(view, world)) pick(view)` */
export function tokenContains(view: TokenFootprint, world: Point): boolean {
  const rect = tokenWorldRect(view);
  return (
    world.x >= rect.x &&
    world.x < rect.x + rect.width &&
    world.y >= rect.y &&
    world.y < rect.y + rect.height
  );
}
