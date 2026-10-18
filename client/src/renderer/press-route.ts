import type { ResizeHandle } from '@lorkarium/game-core';
import type { BoardView, TokenView } from './board-view';
import type { Point } from './camera';
import { topDrawingAt, type DrawingView } from './drawing-view';
import { topEffectAreaAt, type EffectAreaView } from './effect-area-view';
import { handleAt } from './facing-handle';
import { boardFacingTargetOf, boardResizeTargetOf } from './handle-targets';
import { RESIZE_HANDLE_REACH, resizeHandleAt } from './resize-handles';
import { tokenContains } from './token-box';

/** Who takes a primary press, in priority order: the draw and area tools sketch; with Selecionar the
 *  facing handle, then a resize square, then a token, then a drawing, then an area of effect
 *  (at the bottom of the Tokens layer), then the marquee on the
 *  empty board; any other tool just reports the pointer. */
export type PressRoute =
  | Readonly<{ kind: 'sketch' }>
  | Readonly<{ kind: 'areaSketch' }>
  | Readonly<{ kind: 'facingHandle' }>
  | Readonly<{ kind: 'resizeHandle' }>
  | Readonly<{ kind: 'token'; token: TokenView }>
  | Readonly<{ kind: 'drawing'; drawing: DrawingView }>
  | Readonly<{ kind: 'effectArea'; area: EffectAreaView }>
  | Readonly<{ kind: 'marquee' }>
  | Readonly<{ kind: 'pointer' }>;

/** What the pointer without a button shows: the token whose name appears, the handle whose
 *  stretch cursor appears. */
export type HoverRoute = Readonly<{ tokenId: string | null; handle: ResizeHandle | null }>;

/** The route of a primary press at `world` (px), at the current zoom.
 *
 *  Example: `pressRouteOf(view, world, camera.zoom).kind // 'token'` */
export function pressRouteOf(view: BoardView, world: Point, zoom: number): PressRoute {
  if (view.tool === 'draw') return { kind: 'sketch' };
  if (view.tool === 'area') return { kind: 'areaSketch' };
  if (view.tool !== 'select') return { kind: 'pointer' };
  const facing = boardFacingTargetOf(view);
  if (facing && handleAt(facing, world)) return { kind: 'facingHandle' };
  if (resizeHandleOf(view, world, zoom)) return { kind: 'resizeHandle' };
  const token = topTokenAt(view.tokens, world);
  if (token) return { kind: 'token', token };
  const drawing = topDrawingAt(view.drawings, world);
  if (drawing) return { kind: 'drawing', drawing };
  const area = topEffectAreaAt(view.effectAreas, world);
  if (area) return { kind: 'effectArea', area };
  return { kind: 'marquee' };
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
