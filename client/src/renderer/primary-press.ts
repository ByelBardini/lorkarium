import { cell, type Cell } from '@lorkarium/game-core';
import type { BoardIntentListener } from './board-renderer';
import type { BoardView } from './board-view';
import { CELL_WORLD_SIZE, type Point } from './camera';
import type { DrawingGestures } from './drawing-gestures';
import type { EffectAreaGestures } from './effect-area-gestures';
import type { LightGestures } from './light-gestures';
import type { PixiBoardOverlays } from './pixi-board-overlays';
import type { PixiFacingHandle } from './pixi-facing-handle';
import type { PixiMarquee } from './pixi-marquee';
import type { PixiResizeHandles } from './pixi-resize-handles';
import { isAltPing, movePingHold, pingHoldDue, startPingHold, type PingHold } from './ping-hold';
import type { PixiTokenLayer } from './pixi-token-layer';
import { pressRouteOf, type PressRoute } from './press-route';
import {
  dropCellOf,
  grabOffsetOf,
  heldCenterOf,
  movePress,
  pressToken,
  releasePress,
  type TokenPress,
} from './token-drag';

/** The primary pointer at one instant: screen and world px, the cell under it, the modifier
 *  keys and when (`event.timeStamp`, the clock of `performance.now()`). */
export type PressPoint = Readonly<{
  screen: Point;
  world: Point;
  cell: Cell | null;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  time: number;
}>;

/** What the press reads of the board: the last view (`null` before the first) and the zoom. */
export type PressContext = Readonly<{ view: BoardView | null; zoom: number }>;

/** The pieces a press drives; each one draws its own gesture. */
export type PressParts = Readonly<{
  overlays: Pick<PixiBoardOverlays, 'move' | 'release' | 'cancel'> & {
    readonly facingHandle: Pick<PixiFacingHandle, 'press'>;
    readonly resizeHandles: Pick<PixiResizeHandles, 'press'>;
    readonly marquee: Pick<PixiMarquee, 'start' | 'grow' | 'end'>;
  };
  lights: Pick<LightGestures, 'press' | 'move' | 'release' | 'cancel'>;
  sketches: Pick<DrawingGestures, 'startSketch' | 'press' | 'move' | 'release' | 'cancel'>;
  areas: Pick<EffectAreaGestures, 'startSketch' | 'press' | 'move' | 'release' | 'cancel'>;
  tokens: Pick<PixiTokenLayer, 'drag' | 'release'>;
  onIntent: BoardIntentListener;
}>;

// Holding still pings only where holding is not already part of the gesture: a token or the
// empty board of Selecionar.
const HOLD_ROUTES: ReadonlySet<PressRoute['kind']> = new Set(['token', 'marquee']);

/** The primary button from press to release: which gesture takes it (`pressRouteOf`), the token
 *  drag, the plain pointer of the other tools and the ping (Alt + press, or held still in
 *  Selecionar). Pure of DOM: the renderer hands it points, and the ticker the time (`tick`).
 *
 *  Example: `press.down({ view, zoom }, { screen, world, cell, shiftKey: event.shiftKey })` */
export class PrimaryPress {
  private primaryDown = false;
  private tokenPress: TokenPress | null = null;
  private dragCellKey: string | null = null;
  private hold: Readonly<{ hold: PingHold; world: Point }> | null = null;
  // Once a hold became a ping, the rest of that press (moves and the release) means nothing.
  private pinged = false;

  constructor(private readonly parts: PressParts) {}

  down(context: PressContext, at: PressPoint): void {
    const { view, zoom } = context;
    if (isAltPing({ button: 0, ...at })) return this.ping(view, at.world);
    const route: PressRoute = view ? pressRouteOf(view, at.world, zoom) : { kind: 'pointer' };
    this.take(route, context, at);
    if (view?.tool === 'select' && HOLD_ROUTES.has(route.kind)) {
      this.hold = { hold: startPingHold(at.screen, at.time), world: at.world };
    }
  }

  /** Called every frame: a hold that lasted 500 ms in place becomes a ping, and what the press
   *  had started (a token press, a marquee) is dropped without a pick or a selection. */
  tick(context: PressContext, now: number): void {
    if (!this.hold || !pingHoldDue(this.hold.hold, now)) return;
    const { world } = this.hold;
    this.hold = null;
    this.pinged = true;
    if (this.tokenPress) this.endTokenPress();
    if (this.primaryDown) this.parts.overlays.marquee.end(null, false);
    this.primaryDown = false;
    this.ping(context.view, world);
  }

  /** Whether a gesture took the move; if not, the renderer reports the hover. */
  move(context: PressContext, at: PressPoint): boolean {
    if (this.pinged) return true;
    if (this.hold) this.hold = { ...this.hold, hold: movePingHold(this.hold.hold, at.screen) };
    const { overlays, lights, sketches, areas } = this.parts;
    const { screen, world, shiftKey } = at;
    if (overlays.move(world, shiftKey)) return true;
    if (lights.move(screen, world, shiftKey)) return true;
    if (this.tokenPress) return this.dragToken(context.view, at, this.tokenPress);
    if (sketches.move(screen, world, shiftKey)) return true;
    if (areas.move(screen, world, shiftKey)) return true;
    return overlays.marquee.grow(screen, world, context.zoom);
  }

  /** The plain pointer of a held button that no gesture took. */
  pointerMoved(at: PressPoint): void {
    if (this.primaryDown) this.parts.onIntent({ kind: 'pointerMove', cell: at.cell });
  }

  up(context: PressContext, at: PressPoint): void {
    this.hold = null;
    if (this.pinged) return void (this.pinged = false);
    const { overlays, lights, sketches, areas } = this.parts;
    const { screen, world, shiftKey } = at;
    if (overlays.release()) return;
    if (lights.release(screen, world, shiftKey)) return;
    if (sketches.release(world, shiftKey)) return;
    if (areas.release(screen, world, shiftKey)) return;
    if (this.tokenPress) return this.releaseToken(context.view, at, this.tokenPress);
    if (!this.primaryDown) return;
    this.primaryDown = false;
    overlays.marquee.end(context.view, shiftKey);
    this.parts.onIntent({ kind: 'pointerUp', cell: at.cell });
  }

  /** Escape: drops whatever gesture is under way; `false` when there was none. */
  cancel(): boolean {
    this.hold = null;
    if (this.tokenPress?.dragging) return this.cancelTokenDrag(this.tokenPress);
    const { overlays, lights, sketches, areas } = this.parts;
    return sketches.cancel() || areas.cancel() || overlays.cancel() || lights.cancel();
  }

  // The route is decided by `pressRouteOf`; this only starts what it names.
  private take(route: PressRoute, { view, zoom }: PressContext, at: PressPoint): void {
    const { overlays, lights, sketches, areas, onIntent } = this.parts;
    const { screen, world } = at;
    if (view && route.kind === 'sketch') return sketches.startSketch(view, world);
    if (route.kind === 'door') return onIntent({ kind: 'doorPressed', wallId: route.wallId });
    if (route.kind === 'wallErase') {
      const { wallId, segmentIndex } = route;
      return onIntent({ kind: 'wallErased', wallId, segmentIndex });
    }
    if (view && route.kind === 'areaSketch') return areas.startSketch(view, world);
    if (route.kind === 'conditionTarget') {
      return onIntent({ kind: 'conditionStamped', tokenId: route.tokenId, removes: at.shiftKey });
    }
    if (view && route.kind === 'light') {
      return lights.press(view.grid.cells, screen, world, route.lightId);
    }
    if (view && route.kind === 'facingHandle') return void overlays.facingHandle.press(view, world);
    if (view && route.kind === 'resizeHandle') {
      return void overlays.resizeHandles.press(view, world, zoom);
    }
    if (route.kind === 'token') return this.pressToken(route.token, at);
    if (view && route.kind === 'drawing') return void sketches.press(view, screen, world);
    if (view && route.kind === 'effectArea') return void areas.press(view, screen, world);
    this.pressPointer(route, at);
  }

  // Only a point of the scene: off it there is nothing to point at (and the server refuses it).
  private ping(view: BoardView | null, world: Point): void {
    const scene = view?.sceneSize;
    if (!scene || world.x < 0 || world.y < 0) return;
    if (world.x > scene.width || world.y > scene.height) return;
    const x = world.x / CELL_WORLD_SIZE;
    this.parts.onIntent({ kind: 'pingRequested', x, y: world.y / CELL_WORLD_SIZE });
  }

  private pressToken(token: Extract<PressRoute, { kind: 'token' }>['token'], at: PressPoint): void {
    const grab = grabOffsetOf(token, at.world);
    this.tokenPress = pressToken(token.id, token.draggable, at.screen, grab);
  }

  private pressPointer(route: PressRoute, at: PressPoint): void {
    this.primaryDown = true;
    if (route.kind === 'marquee') this.parts.overlays.marquee.start(at.screen, at.world);
    // Shift keeps the selection: the marquee about to be drawn adds to it.
    if (route.kind === 'marquee' && at.shiftKey) return;
    this.parts.onIntent({ kind: 'pointerDown', cell: at.cell });
  }

  private dragToken(view: BoardView | null, at: PressPoint, current: TokenPress): true {
    const { press, dragging } = movePress(current, at.screen);
    this.tokenPress = press;
    if (!dragging) return true;
    this.parts.tokens.drag(press.tokenId, heldCenterOf(press, at.world));
    this.reportDragCell(view, press.tokenId, dropCellAt(view, press, at.world));
    return true;
  }

  // Only a new cell is news: the pointer moves many times inside one.
  private reportDragCell(view: BoardView | null, tokenId: string, over: Cell | null): void {
    const key = over ? `${over.col},${over.row}` : 'off';
    if (key === this.dragCellKey) return;
    this.dragCellKey = key;
    const token = view?.tokens.find(({ id }) => id === tokenId);
    if (!token) return;
    const origin = cell(token.col, token.row);
    this.parts.onIntent({ kind: 'tokenDragged', tokenId, origin, cell: over });
  }

  private cancelTokenDrag(press: TokenPress): true {
    this.endTokenPress();
    this.parts.onIntent({ kind: 'tokenDragCancelled', tokenId: press.tokenId });
    return true;
  }

  private releaseToken(view: BoardView | null, at: PressPoint, press: TokenPress): void {
    this.endTokenPress();
    const { tokenId } = press;
    if (releasePress(press) === 'pick') {
      return this.parts.onIntent({ kind: 'tokenPicked', tokenId, additive: at.shiftKey });
    }
    this.parts.onIntent({ kind: 'tokenDropped', tokenId, cell: dropCellAt(view, press, at.world) });
  }

  private endTokenPress(): void {
    this.tokenPress = null;
    this.dragCellKey = null;
    this.parts.tokens.release();
  }
}

function dropCellAt(view: BoardView | null, press: TokenPress, world: Point): Cell | null {
  const token = view?.tokens.find(({ id }) => id === press.tokenId);
  if (!view || !token) return null;
  return dropCellOf(view.grid.cells, token, heldCenterOf(press, world));
}
