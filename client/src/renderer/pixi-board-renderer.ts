import { cell, type Cell } from '@lorkarium/game-core';
import { Application, Container, Graphics } from 'pixi.js';
import type { BoardIntentListener, BoardRenderer, CreateBoardRenderer } from './board-renderer';
import { boardCursorOf } from './board-cursor';
import { imageUrlsOf, type BoardView } from './board-view';
import {
  clampToScene,
  fitScene,
  panBy,
  screenToWorld,
  zoomAt,
  type Camera,
  type Point,
  type Size,
} from './camera';
import {
  blocksBrowserMenu,
  cameraKeyAction,
  endRightDrag,
  keyboardPan,
  moveRightDrag,
  panKeyOf,
  startRightDrag,
  wheelIntent,
  type PanKey,
  type RightDrag,
} from './camera-input';
import { cellAtWorld, gridLines, visibleWorldRect } from './grid-geometry';
import { tokenMenuTarget } from './marquee';
import { DrawingGestures } from './drawing-gestures';
import { EffectAreaGestures } from './effect-area-gestures';
import { pointOf, prefersReducedMotion, wheelFields } from './dom-input';
import { hoverRouteOf, pressRouteOf, topTokenAt, type PressRoute } from './press-route';
import { tokenCenterOf } from './token-box';
import { PixiDrawingLayer } from './pixi-drawing-layer';
import { PixiEffectAreaLayer } from './pixi-effect-area-layer';
import { PixiFacingHandle } from './pixi-facing-handle';
import { PixiResizeHandles } from './pixi-resize-handles';
import { PixiRuler } from './pixi-ruler';
import { resizeCursorOf } from './resize-handles';
import { PixiMarquee } from './pixi-marquee';
import { PixiSceneBackground } from './pixi-scene-background';
import { PixiTextureCache } from './pixi-texture-cache';
import { PixiTokenLayer } from './pixi-token-layer';
import {
  dropCellOf,
  grabOffsetOf,
  heldCenterOf,
  movePress,
  pressToken,
  releasePress,
  type TokenPress,
} from './token-drag';

// Design system tokens (client/src/index.css): the canvas cannot read CSS variables.
const PANEL_COLOR = 0x0c0e11;
const SCENE_COLOR = 0x15181d;
const GOLD_COLOR = 0xc5a46d;
const BUTTON_ZOOM_STEP = 1.25;
const SECONDARY_BUTTON = 2;
const PRIMARY_BUTTON = 0;
const EDITABLE = 'input, textarea, [contenteditable]:not([contenteditable="false"])';

/** The PixiJS board, as `AppDependencies.createBoardRenderer` in the app.
 *
 *  Example: `buildRoutes({ ...deps, createBoardRenderer: createPixiBoardRenderer })` */
export const createPixiBoardRenderer: CreateBoardRenderer = (onIntent) =>
  new PixiBoardRenderer(onIntent);

/** Thin shell over PixiJS: every decision (camera math, input mapping, grid lines, what to draw)
 *  is in the pure modules beside it; this only wires them to the canvas. Proven by the e2e. */
class PixiBoardRenderer implements BoardRenderer {
  private app: Application | null = null;
  private destroyed = false;
  private camera: Camera = { offsetX: 0, offsetY: 0, zoom: 1 };
  private view: BoardView | null = null;
  private framed = false;
  private rightDrag: RightDrag | null = null;
  private primaryDown = false;
  private tokenPress: TokenPress | null = null;
  private dragCellKey: string | null = null;
  private hoverCellKey: string | null = null;
  private readonly drawings = new PixiDrawingLayer();
  private readonly effectAreas = new PixiEffectAreaLayer();
  // A texture that arrives later draws the last view again, with the image this time.
  private readonly textures = new PixiTextureCache(() => this.view && this.draw(this.view));
  private readonly background = new PixiSceneBackground(this.textures);
  private readonly tokens = new PixiTokenLayer(
    prefersReducedMotion,
    this.effectAreas.under(this.drawings.layers),
    this.textures,
  );
  private readonly gestures = new DrawingGestures(this.drawings, (intent) => this.onIntent(intent));
  private readonly areaGestures = new EffectAreaGestures(this.effectAreas, (intent) =>
    this.onIntent(intent),
  );
  private readonly facingHandle = new PixiFacingHandle((intent) => this.onIntent(intent));
  private readonly resizeHandles = new PixiResizeHandles((intent) => this.onIntent(intent));
  private readonly heldPanKeys = new Set<PanKey>();
  private readonly disposers: Array<() => void> = [];
  private readonly world = new Container();
  private readonly sceneShape = new Graphics();
  private readonly grid = new Graphics();
  private readonly ruler = new PixiRuler();
  private readonly marquee = new PixiMarquee((intent) => this.onIntent(intent));

  constructor(private readonly onIntent: BoardIntentListener) {}

  async mount(host: HTMLElement): Promise<void> {
    const app = new Application();
    await app.init({ resizeTo: host, background: PANEL_COLOR, antialias: true, autoDensity: true });
    // Unmounted while `init` ran (StrictMode does it on purpose): tear down what init built.
    if (this.destroyed) return void app.destroy(true, { children: true });
    this.app = app;
    host.appendChild(app.canvas);
    const { container: tokenLayer } = this.tokens;
    this.world.addChild(
      this.sceneShape,
      this.background.container,
      this.grid,
      tokenLayer,
      this.resizeHandles.shape,
      this.facingHandle.shape,
      this.drawings.draft,
      this.effectAreas.draft,
      this.ruler.container,
      this.marquee.shape,
    );
    app.stage.addChild(this.world);
    this.listen(host, app.canvas);
    this.followHostSize(host, app);
    app.ticker.add((ticker) => {
      this.panWithKeys(ticker.deltaMS);
      this.tokens.animate(performance.now());
    });
    app.renderer.on('resize', () => this.applyCamera(this.camera));
    if (this.view) this.draw(this.view);
  }

  draw(view: BoardView): void {
    this.view = view;
    if (!this.app) return;
    this.drawScene(view);
    this.textures.retain(imageUrlsOf(view));
    this.background.sync(view.background);
    this.showCursor();
    this.drawings.sync(view.drawings);
    this.effectAreas.sync(view.effectAreas, view.sceneSize);
    this.tokens.sync(view.tokens, view.ghosts, performance.now());
    if (!this.framed) {
      this.framed = true;
      return this.fitScene();
    }
    this.applyCamera(this.camera);
  }

  zoomBy(factor: number): void {
    const { width, height } = this.screenSize();
    this.applyCamera(zoomAt(this.camera, factor, { x: width / 2, y: height / 2 }));
  }

  fitScene(): void {
    if (!this.view) return;
    this.applyCamera(fitScene(this.view.sceneSize, this.screenSize()));
  }

  centerOn(target: Readonly<{ col: number; row: number }>): void {
    const center = tokenCenterOf({ ...target, width: 1, height: 1 });
    const visible = visibleWorldRect(this.camera, this.screenSize());
    const inside =
      center.x >= visible.x &&
      center.x <= visible.x + visible.width &&
      center.y >= visible.y &&
      center.y <= visible.y + visible.height;
    if (inside) return;
    const { width, height } = this.screenSize();
    const { zoom } = this.camera;
    this.applyCamera({
      zoom,
      offsetX: width / 2 - center.x * zoom,
      offsetY: height / 2 - center.y * zoom,
    });
  }

  viewCenterCell(): ReturnType<typeof cellAtWorld> {
    if (!this.view) return null;
    const { width, height } = this.screenSize();
    const center = screenToWorld(this.camera, { x: width / 2, y: height / 2 });
    return cellAtWorld(this.view.grid.cells, center);
  }

  destroy(): void {
    this.destroyed = true;
    for (const dispose of this.disposers.splice(0)) dispose();
    this.textures.destroy();
    this.app?.destroy(true, { children: true });
    this.app = null;
  }

  private applyCamera(next: Camera): void {
    const scene = this.view?.sceneSize;
    this.camera = scene ? clampToScene(next, scene, this.screenSize()) : next;
    this.world.position.set(this.camera.offsetX, this.camera.offsetY);
    this.world.scale.set(this.camera.zoom);
    if (this.view) this.drawOverlays(this.view);
    this.onIntent({ kind: 'cameraChanged', zoom: this.camera.zoom });
  }

  private drawScene(view: BoardView): void {
    this.sceneShape
      .clear()
      .rect(0, 0, view.sceneSize.width, view.sceneSize.height)
      .fill(SCENE_COLOR);
  }

  private drawOverlays(view: BoardView): void {
    this.drawGrid(view);
    this.ruler.draw(view, this.camera.zoom);
    this.resizeHandles.draw(view, this.camera.zoom);
    this.facingHandle.draw(view, this.camera.zoom);
  }

  // Only the lines on screen, as hairlines whatever the zoom.
  private drawGrid(view: BoardView): void {
    this.grid.clear();
    if (!view.grid.visible) return;
    const lines = gridLines(view.grid.cells, visibleWorldRect(this.camera, this.screenSize()));
    for (const x of lines.vertical) this.grid.moveTo(x, 0).lineTo(x, view.sceneSize.height);
    for (const y of lines.horizontal) this.grid.moveTo(0, y).lineTo(view.sceneSize.width, y);
    const width = 1 / this.camera.zoom;
    this.grid.stroke({ width, color: GOLD_COLOR, alpha: view.grid.opacity });
  }

  private listen(host: HTMLElement, canvas: HTMLCanvasElement): void {
    this.on(canvas, 'wheel', (event) => this.onWheel(event), { passive: false });
    this.holdBackBrowserMenu(host);
    this.on(canvas, 'pointerdown', (event) => this.onPointerDown(event, canvas));
    this.on(canvas, 'pointermove', (event) => this.onPointerMove(event));
    this.on(canvas, 'pointerup', (event) => this.onPointerUp(event));
    this.on(canvas, 'pointerleave', () => {
      this.reportHover(null);
      this.tokens.hover(null);
    });
    // Keys on the focusable host, not on the window: typing elsewhere never moves the board.
    this.on(host, 'keydown', (event) => this.onKeyDown(event));
    this.on(host, 'keyup', (event) => this.onKeyUp(event));
    this.on(host, 'blur', () => this.heldPanKeys.clear());
  }

  // `resizeTo` only listens to the window: a host that changes size on its own (the room
  // settling after entering) left the canvas stale and "Enquadrar cena" off-center.
  private followHostSize(host: HTMLElement, app: Application): void {
    const observer = new ResizeObserver(() => app.queueResize());
    observer.observe(host);
    this.disposers.push(() => observer.disconnect());
  }

  // On the document: the right click that opens our token menu lands on the page, not the canvas.
  private holdBackBrowserMenu(host: HTMLElement): void {
    const doc = host.ownerDocument;
    const onMenu = (event: MouseEvent): void => {
      const editable = event.target instanceof Element && event.target.closest(EDITABLE) !== null;
      const click = { x: event.clientX, y: event.clientY, editable };
      if (blocksBrowserMenu(click, host.getBoundingClientRect())) event.preventDefault();
    };
    doc.addEventListener('contextmenu', onMenu);
    this.disposers.push(() => doc.removeEventListener('contextmenu', onMenu));
  }

  private showCursor(): void {
    if (!this.app || !this.view) return;
    const drawKind = this.view.sketch?.kind ?? null;
    const panning = this.rightDrag?.panning ?? false;
    this.app.canvas.style.cursor = boardCursorOf({ tool: this.view.tool, drawKind, panning });
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    const intent = wheelIntent({ ...wheelFields(event), x: event.offsetX, y: event.offsetY });
    if (intent.kind === 'pan') return this.applyCamera(panBy(this.camera, intent.dx, intent.dy));
    this.applyCamera(zoomAt(this.camera, intent.factor, intent.at));
  }

  private onPointerDown(event: PointerEvent, canvas: HTMLCanvasElement): void {
    canvas.setPointerCapture(event.pointerId);
    if (event.button === SECONDARY_BUTTON) this.rightDrag = startRightDrag(pointOf(event));
    if (event.button !== PRIMARY_BUTTON) return;
    const world = this.worldOf(event);
    const route: PressRoute = this.view
      ? pressRouteOf(this.view, world, this.camera.zoom)
      : { kind: 'pointer' };
    this.takePress(route, event, world);
  }

  // The route is decided by `pressRouteOf`; this only starts what it names.
  private takePress(route: PressRoute, event: PointerEvent, world: Point): void {
    const view = this.view;
    if (view && route.kind === 'sketch') return this.gestures.startSketch(view, world);
    if (view && route.kind === 'areaSketch') return this.areaGestures.startSketch(view, world);
    if (view && route.kind === 'facingHandle') return void this.facingHandle.press(view, world);
    if (view && route.kind === 'resizeHandle') {
      return void this.resizeHandles.press(view, world, this.camera.zoom);
    }
    if (route.kind === 'token') {
      const { token } = route;
      const grab = grabOffsetOf(token, world);
      return void (this.tokenPress = pressToken(token.id, token.draggable, pointOf(event), grab));
    }
    const screen = pointOf(event);
    if (view && route.kind === 'drawing') return void this.gestures.press(view, screen, world);
    if (view && route.kind === 'effectArea')
      return void this.areaGestures.press(view, screen, world);
    this.primaryDown = true;
    if (route.kind === 'marquee') this.marquee.start(pointOf(event), world);
    // Shift keeps the selection: the marquee about to be drawn adds to it.
    if (route.kind === 'marquee' && event.shiftKey) return;
    this.onIntent({ kind: 'pointerDown', cell: this.cellAt(event) });
  }

  private onPointerMove(event: PointerEvent): void {
    if (this.rightDrag) {
      const { drag, pan } = moveRightDrag(this.rightDrag, pointOf(event));
      this.rightDrag = drag;
      if (pan) this.applyCamera(panBy(this.camera, pan.dx, pan.dy));
      if (pan) this.showCursor();
      return;
    }
    if (this.facingHandle.move(this.worldOf(event), event.shiftKey)) return;
    if (this.resizeHandles.move(this.worldOf(event), event.shiftKey)) return;
    if (this.tokenPress) return this.dragToken(event, this.tokenPress);
    if (this.gestures.move(pointOf(event), this.worldOf(event), event.shiftKey)) return;
    if (this.areaGestures.move(pointOf(event), this.worldOf(event), event.shiftKey)) return;
    if (this.marquee.grow(pointOf(event), this.worldOf(event), this.camera.zoom)) return;
    if (event.buttons === 0) this.hoverAt(event);
    if (this.primaryDown) this.onIntent({ kind: 'pointerMove', cell: this.cellAt(event) });
  }

  private dragToken(event: PointerEvent, current: TokenPress): void {
    const { press, dragging } = movePress(current, pointOf(event));
    this.tokenPress = press;
    if (!dragging) return;
    this.tokens.drag(press.tokenId, heldCenterOf(press, this.worldOf(event)));
    this.reportDragCell(press.tokenId, this.dropCellAt(press, event));
  }

  // Only a new cell is news: the pointer moves many times inside one.
  private reportDragCell(tokenId: string, over: Cell | null): void {
    const key = over ? `${over.col},${over.row}` : 'off';
    if (key === this.dragCellKey) return;
    this.dragCellKey = key;
    const token = this.view?.tokens.find(({ id }) => id === tokenId);
    if (!token) return;
    const origin = cell(token.col, token.row);
    this.onIntent({ kind: 'tokenDragged', tokenId, origin, cell: over });
  }

  private cancelTokenDrag(press: TokenPress): void {
    this.tokenPress = null;
    this.dragCellKey = null;
    this.tokens.release();
    this.onIntent({ kind: 'tokenDragCancelled', tokenId: press.tokenId });
  }

  private dropCellAt(press: TokenPress, event: PointerEvent): Cell | null {
    const token = this.view?.tokens.find(({ id }) => id === press.tokenId);
    const cells = this.view?.grid.cells;
    const center = heldCenterOf(press, this.worldOf(event));
    return cells && token ? dropCellOf(cells, token, center) : null;
  }

  private releaseToken(event: PointerEvent, press: TokenPress): void {
    this.tokenPress = null;
    this.dragCellKey = null;
    this.tokens.release();
    const { tokenId } = press;
    if (releasePress(press) === 'pick') {
      return this.onIntent({ kind: 'tokenPicked', tokenId, additive: event.shiftKey });
    }
    this.onIntent({ kind: 'tokenDropped', tokenId, cell: this.dropCellAt(press, event) });
  }

  // The name of the token under the pointer, the stretch cursor over a handle, the hovered cell.
  private hoverAt(event: PointerEvent): void {
    const world = this.worldOf(event);
    this.reportHover(this.cellAt(event));
    if (!this.view) return;
    const { tokenId, handle } = hoverRouteOf(this.view, world, this.camera.zoom);
    this.tokens.hover(tokenId);
    if (!handle || !this.app) return this.showCursor();
    this.app.canvas.style.cursor = resizeCursorOf(handle);
  }

  // Only a new cell is news, as with a drag: the pointer moves many times inside one.
  private reportHover(over: Cell | null): void {
    const key = over ? `${over.col},${over.row}` : 'off';
    if (key === this.hoverCellKey) return;
    this.hoverCellKey = key;
    this.onIntent({ kind: 'pointerHovered', cell: over });
  }

  private onPointerUp(event: PointerEvent): void {
    if (event.button === SECONDARY_BUTTON) return this.endRightClick(event);
    const primary = event.button === PRIMARY_BUTTON;
    if (primary && this.facingHandle.release()) return;
    if (primary && this.resizeHandles.release()) return;
    if (primary && this.gestures.release(this.worldOf(event), event.shiftKey)) return;
    if (primary && this.areaGestures.release(pointOf(event), this.worldOf(event), event.shiftKey)) {
      return;
    }
    if (event.button === PRIMARY_BUTTON && this.tokenPress) {
      return this.releaseToken(event, this.tokenPress);
    }
    if (event.button !== PRIMARY_BUTTON || !this.primaryDown) return;
    this.primaryDown = false;
    this.marquee.end(this.view, event.shiftKey);
    this.onIntent({ kind: 'pointerUp', cell: this.cellAt(event) });
  }

  // Dragged, the right button moved the camera; a short click asks for the token menu.
  private endRightClick(event: PointerEvent): void {
    const drag = this.rightDrag;
    this.rightDrag = null;
    this.showCursor();
    if (!drag || !this.view || endRightDrag(drag) !== 'context') return;
    const tokenId = tokenMenuTarget(this.view, topTokenAt(this.view.tokens, this.worldOf(event)));
    if (!tokenId) return;
    this.onIntent({ kind: 'tokenMenuRequested', tokenId, x: event.clientX, y: event.clientY });
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.tokenPress?.dragging) {
      return this.cancelTokenDrag(this.tokenPress);
    }
    if (event.key === 'Escape' && (this.gestures.cancel() || this.areaGestures.cancel())) return;
    if (event.key === 'Escape' && this.facingHandle.cancel()) return;
    if (event.key === 'Escape' && this.resizeHandles.cancel()) return;
    const modified = event.ctrlKey || event.metaKey || event.altKey;
    const panKey = modified ? null : panKeyOf(event.key);
    if (panKey) return void this.heldPanKeys.add(panKey);
    const action = cameraKeyAction(event);
    if (action === 'zoom-in') this.zoomBy(BUTTON_ZOOM_STEP);
    if (action === 'zoom-out') this.zoomBy(1 / BUTTON_ZOOM_STEP);
    if (action === 'fit') this.fitScene();
  }

  private onKeyUp(event: KeyboardEvent): void {
    const panKey = panKeyOf(event.key);
    if (panKey) this.heldPanKeys.delete(panKey);
  }

  private panWithKeys(elapsedMs: number): void {
    if (this.heldPanKeys.size === 0) return;
    const { dx, dy } = keyboardPan(this.heldPanKeys, elapsedMs);
    this.applyCamera(panBy(this.camera, dx, dy));
  }

  private cellAt(event: PointerEvent): ReturnType<typeof cellAtWorld> {
    if (!this.view) return null;
    return cellAtWorld(this.view.grid.cells, this.worldOf(event));
  }

  private worldOf(event: PointerEvent): Point {
    return screenToWorld(this.camera, pointOf(event));
  }

  private screenSize(): Size {
    const screen = this.app?.screen;
    return { width: screen?.width ?? 1, height: screen?.height ?? 1 };
  }

  private on<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, listener, options);
    this.disposers.push(() => target.removeEventListener(type, listener, options));
  }
}
