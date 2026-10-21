import type { ResizeHandle } from '@lorkarium/game-core';
import type { BoardView, TokenView } from './board-view';
import type { Point } from './camera';
import { topDrawingAt, type DrawingView } from './drawing-view';
import { topEffectAreaAt, type EffectAreaView } from './effect-area-view';
import { handleAt } from './facing-handle';
import { boardFacingTargetOf, boardResizeTargetOf } from './handle-targets';
import { RESIZE_HANDLE_REACH, resizeHandleAt } from './resize-handles';
import { topLightAt } from './light-view';
import { tokenMenuTarget } from './marquee';
import { tokenContains } from './token-box';
import { doorIconAt, wallTargetAt } from './wall-view';

/** Who takes a primary press, in priority order: the draw tool sketches (in Selecionar it takes
 *  the drawing under the press, or starts the marquee), the area tool sketches, the walls tool
 *  sketches (a wall or the eraser box) or erases by its action, the lights tool aims the spotlight
 *  picked by its handle or puts a light (or takes the light under it, `lightId`); with Selecionar the
 *  facing handle, then a resize square, then a token, then an area of effect (at the bottom of the
 *  Tokens layer), then the marquee on the empty board — never a drawing; any other tool just
 *  reports the pointer. */
export type PressRoute =
  | Readonly<{ kind: 'sketch' }>
  | Readonly<{ kind: 'wallErase'; wallId: string; segmentIndex: number | null }>
  | Readonly<{ kind: 'door'; wallId: string }>
  | Readonly<{ kind: 'areaSketch' }>
  | Readonly<{ kind: 'light'; lightId: string | null }>
  | Readonly<{ kind: 'facingHandle' }>
  | Readonly<{ kind: 'resizeHandle' }>
  | Readonly<{ kind: 'token'; token: TokenView }>
  | Readonly<{ kind: 'drawing'; drawing: DrawingView }>
  | Readonly<{ kind: 'effectArea'; area: EffectAreaView }>
  | Readonly<{ kind: 'marquee' }>
  | Readonly<{ kind: 'pointer' }>;

/** What a short right click opens: the master's door or light menu, or the menu of a token. */
export type MenuRoute =
  | Readonly<{ kind: 'door'; wallId: string }>
  | Readonly<{ kind: 'light'; lightId: string }>
  | Readonly<{ kind: 'token'; tokenId: string }>
  | null;

/** What the pointer without a button shows: the token whose name appears, the handle whose
 *  stretch cursor appears. */
export type HoverRoute = Readonly<{ tokenId: string | null; handle: ResizeHandle | null }>;

/** The route of a primary press at `world` (px), at the current zoom.
 *
 *  Example: `pressRouteOf(view, world, camera.zoom).kind // 'token'` */
export function pressRouteOf(view: BoardView, world: Point, zoom: number): PressRoute {
  if (view.tool === 'walls') return wallRouteOf(view, world);
  if (view.tool === 'draw') return drawRouteOf(view, world);
  if (view.tool === 'area') return { kind: 'areaSketch' };
  if (view.tool === 'lights') return lightRouteOf(view, world, zoom);
  if (view.tool !== 'select') return { kind: 'pointer' };
  const facing = boardFacingTargetOf(view);
  if (facing && handleAt(facing, world)) return { kind: 'facingHandle' };
  if (resizeHandleOf(view, world, zoom)) return { kind: 'resizeHandle' };
  // A door icon sits on its line, often over a token standing in the doorway: the door wins.
  const door = doorIconAt(view.doors, world, zoom);
  if (door) return { kind: 'door', wallId: door.wallId };
  const token = topTokenAt(view.tokens, world);
  if (token) return { kind: 'token', token };
  const area = topEffectAreaAt(view.effectAreas, world);
  if (area) return { kind: 'effectArea', area };
  return { kind: 'marquee' };
}

// Desenhar always starts a new stroke, even over another drawing; Selecionar takes them.
function drawRouteOf(view: BoardView, world: Point): PressRoute {
  if (view.drawMode === 'draw') return { kind: 'sketch' };
  const drawing = topDrawingAt(view.drawings, world);
  return drawing ? { kind: 'drawing', drawing } : { kind: 'marquee' };
}

// The handle of the spotlight picked wins over its icon and the board under it.
function lightRouteOf(view: BoardView, world: Point, zoom: number): PressRoute {
  const aim = boardFacingTargetOf(view);
  if (aim && handleAt(aim, world)) return { kind: 'facingHandle' };
  return { kind: 'light', lightId: topLightAt(view.lights, world, zoom)?.id ?? null };
}

// Desenhar always starts a new wall, even on another one: that is how walls chain. The eraser
// box is a sketch too, drawn by the same gestures.
function wallRouteOf(view: BoardView, world: Point): PressRoute {
  if (view.wallMode === 'draw' || view.wallMode === 'eraseArea') return { kind: 'sketch' };
  const target = wallTargetAt(view.walls, world);
  if (!target) return { kind: 'pointer' };
  const { wallId, segmentIndex } = target;
  const piece = view.wallMode === 'eraseSegment' ? segmentIndex : null;
  return { kind: 'wallErase', wallId, segmentIndex: piece };
}

/** The menu a short right click at `world` (px) opens: for the master, a door icon wins over a
 *  light icon, and a light icon over the token under it; then the token, when this viewer may
 *  touch it.
 *
 *  Example: `menuRouteOf(view, world, camera.zoom) // { kind: 'door', wallId }` */
export function menuRouteOf(view: BoardView, world: Point, zoom: number): MenuRoute {
  const door = view.layerMenu ? doorIconAt(view.doors, world, zoom) : null;
  if (door) return { kind: 'door', wallId: door.wallId };
  const light = view.layerMenu ? topLightAt(view.lights, world, zoom) : null;
  if (light) return { kind: 'light', lightId: light.id };
  const tokenId = tokenMenuTarget(view, topTokenAt(view.tokens, world));
  return tokenId ? { kind: 'token', tokenId } : null;
}

/** The route of the pointer moving with no button pressed.
 *
 *  Example: `hoverRouteOf(view, world, camera.zoom).handle // 'se'` */
export function hoverRouteOf(view: BoardView, world: Point, zoom: number): HoverRoute {
  const handle = view.tool === 'select' ? resizeHandleOf(view, world, zoom) : null;
  return { tokenId: topTokenAt(view.tokens, world)?.id ?? null, handle };
}

/** The pickable token drawn on top under `world` (px): the last one in drawing order.
 *
 *  Example: `topTokenAt(view.tokens, world)?.id` */
export function topTokenAt(tokens: readonly TokenView[], world: Point): TokenView | null {
  const topFirst = [...tokens].reverse();
  return topFirst.find((token) => token.pickable && tokenContains(token, world)) ?? null;
}

function resizeHandleOf(view: BoardView, world: Point, zoom: number): ResizeHandle | null {
  const target = boardResizeTargetOf(view);
  return target ? resizeHandleAt(target.rect, world, RESIZE_HANDLE_REACH / zoom) : null;
}
