import { sameCell, type Cell } from '@lorkarium/game-core';

/** Standing this long on a cell while dragging fixes a bend of the ruler there. */
export const ROUTE_BEND_DWELL_MS = 2000;

/** The path a dragged token traced: where it started, the bends fixed by standing still, and
 *  the cell it is over now (entered at `enteredAtMs`). Local to the dragger, never sent. */
export type TokenRoute = Readonly<{
  origin: Cell;
  bends: readonly Cell[];
  current: Cell;
  enteredAtMs: number;
}>;

/** Whether a wall bars the dragged token on the leg from one cell to the other. */
export type RouteBlock = (from: Cell, to: Cell) => boolean;

/** Example: `startRoute(cell(token.col, token.row), clock.now())` */
export function startRoute(origin: Cell, nowMs: number): TokenRoute {
  return { origin, bends: [], current: origin, enteredAtMs: nowMs };
}

/** The route after the token went over `to`. Stepping back onto the last bend undoes it. With
 *  `blocked` (a player's token), a wall in the way bends the route on the last free cell, or —
 *  when even that does not get around it — keeps the token on the cell before the wall.
 *
 *  Example: `route = stepRoute(route, cell(5, 4), clock.now(), blocked)` */
export function stepRoute(
  route: TokenRoute,
  to: Cell,
  nowMs: number,
  blocked?: RouteBlock,
): TokenRoute {
  const settled = settleRoute(route, nowMs);
  if (sameCell(to, settled.current)) return settled;
  const last = settled.bends.at(-1);
  const bends = last && sameCell(to, last) ? settled.bends.slice(0, -1) : settled.bends;
  const stepped = { ...settled, bends, current: to, enteredAtMs: nowMs };
  if (!blocked || !blocked(bends.at(-1) ?? settled.origin, to)) return stepped;
  return aroundTheCorner(settled, to, nowMs, blocked) ?? settled;
}

/** The bends of the route, between the start and the current cell: the `path` a move sends.
 *
 *  Example: `commands.moveToken(id, tokenId, to, routeBends(route))` */
export function routeBends(route: TokenRoute): Cell[] {
  return [...route.bends];
}

// The cell the token was on saw both the anchor and `to`: the route turns there.
function aroundTheCorner(
  route: TokenRoute,
  to: Cell,
  nowMs: number,
  blocked: RouteBlock,
): TokenRoute | null {
  const anchor = route.bends.at(-1) ?? route.origin;
  const corner = route.current;
  if (sameCell(corner, anchor) || blocked(anchor, corner) || blocked(corner, to)) return null;
  return { ...route, bends: [...route.bends, corner], current: to, enteredAtMs: nowMs };
}

/** The route with a bend where the token stood for `ROUTE_BEND_DWELL_MS` (none on the start or
 *  on the bend it already is).
 *
 *  Example: `clock.after(ROUTE_BEND_DWELL_MS, () => (route = settleRoute(route, clock.now())))` */
export function settleRoute(route: TokenRoute, nowMs: number): TokenRoute {
  if (nowMs - route.enteredAtMs < ROUTE_BEND_DWELL_MS) return route;
  const anchor = route.bends.at(-1) ?? route.origin;
  if (sameCell(anchor, route.current)) return route;
  return { ...route, bends: [...route.bends, route.current] };
}

/** Start, bends and the current cell, without repeating the bend the token stands on.
 *
 *  Example: `pathDistance(routePath(route))` */
export function routePath(route: TokenRoute): Cell[] {
  const anchor = route.bends.at(-1) ?? route.origin;
  const tail = sameCell(anchor, route.current) ? [] : [route.current];
  return [route.origin, ...route.bends, ...tail];
}
