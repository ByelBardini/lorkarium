import { cell, type Cell } from '@lorkarium/game-core';
import { Application, Container, Graphics, Text } from 'pixi.js';
import type { BoardIntentListener, BoardRenderer, CreateBoardRenderer } from './board-renderer';
import type { BoardView } from './board-view';
import {
  CELL_WORLD_SIZE,
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
  cameraKeyAction,
  keyboardPan,
  moveRightDrag,
  panKeyOf,
  startRightDrag,
  wheelIntent,
  type PanKey,
  type RightDrag,
} from './camera-input';
import { cellAtWorld, gridLines, visibleWorldRect } from './grid-geometry';
import { PixiTokenLayer } from './pixi-token-layer';
import { dropCellOf, movePress, pressToken, releasePress, type TokenPress } from './token-drag';

// Design system tokens (client/src/index.css): the canvas cannot read CSS variables.
const PANEL_COLOR = 0x0c0e11;
const SCENE_COLOR = 0x15181d;
const GOLD_COLOR = 0xc5a46d;
const LABEL_COLOR = 0xd5d0c4;
const BUTTON_ZOOM_STEP = 1.25;
const SECONDARY_BUTTON = 2;
const PRIMARY_BUTTON = 0;

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
  private readonly tokens = new PixiTokenLayer(prefersReducedMotion);
  private readonly heldPanKeys = new Set<PanKey>();
  private readonly disposers: Array<() => void> = [];
  private readonly world = new Container();
  private readonly sceneShape = new Graphics();
  private readonly grid = new Graphics();
  private readonly rulerShape = new Graphics();
  private readonly rulerText = new Text({
    text: '',
    style: { fontFamily: 'Hanken Grotesk Variable, sans-serif', fontSize: 13, fill: LABEL_COLOR },
  });

  constructor(private readonly onIntent: BoardIntentListener) {}

  async mount(host: HTMLElement): Promise<void> {
    const app = new Application();
    await app.init({ resizeTo: host, background: PANEL_COLOR, antialias: true, autoDensity: true });
    // Unmounted while `init` ran (StrictMode does it on purpose): tear down what init built.
    if (this.destroyed) return void app.destroy(true, { children: true });
    this.app = app;
    host.appendChild(app.canvas);
    const { container: tokenLayer } = this.tokens;
    this.world.addChild(this.sceneShape, this.grid, tokenLayer, this.rulerShape, this.rulerText);
    app.stage.addChild(this.world);
    this.listen(host, app.canvas);
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
    this.tokens.sync(view.tokens, view.ghost, performance.now());
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
    const center = cellCenter(target);
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
    this.drawRuler(view);
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

  // A line through each point (the bends of a drag), a dot on every bend, the reading at the end.
  private drawRuler(view: BoardView): void {
    this.rulerShape.clear();
    const points = view.ruler?.points ?? [];
    const [first, ...rest] = points;
    const last = points.at(-1);
    this.rulerText.visible = Boolean(view.ruler && first && last);
    if (!view.ruler || !first || !last) return;
    const zoom = this.camera.zoom;
    this.rulerShape.moveTo(first.x, first.y);
    for (const point of rest) this.rulerShape.lineTo(point.x, point.y);
    this.rulerShape.stroke({ width: 2 / zoom, color: GOLD_COLOR });
    for (const bend of points.slice(1, -1)) this.rulerShape.circle(bend.x, bend.y, 4 / zoom);
    this.rulerShape.fill(GOLD_COLOR);
    this.rulerText.text = view.ruler.label;
    this.rulerText.scale.set(1 / zoom);
    this.rulerText.position.set(last.x + 12 / zoom, last.y - 24 / zoom);
  }

  private listen(host: HTMLElement, canvas: HTMLCanvasElement): void {
    this.on(canvas, 'wheel', (event) => this.onWheel(event), { passive: false });
    this.on(canvas, 'contextmenu', (event) => event.preventDefault());
    this.on(canvas, 'pointerdown', (event) => this.onPointerDown(event, canvas));
    this.on(canvas, 'pointermove', (event) => this.onPointerMove(event));
    this.on(canvas, 'pointerup', (event) => this.onPointerUp(event));
    // Keys on the focusable host, not on the window: typing elsewhere never moves the board.
    this.on(host, 'keydown', (event) => this.onKeyDown(event));
    this.on(host, 'keyup', (event) => this.onKeyUp(event));
    this.on(host, 'blur', () => this.heldPanKeys.clear());
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
    const token = this.view?.tool === 'select' ? this.tokens.tokenAt(this.worldOf(event)) : null;
    if (token)
      return void (this.tokenPress = pressToken(token.id, token.draggable, pointOf(event)));
    this.primaryDown = true;
    this.onIntent({ kind: 'pointerDown', cell: this.cellAt(event) });
  }

  private onPointerMove(event: PointerEvent): void {
    if (this.rightDrag) {
      const { drag, pan } = moveRightDrag(this.rightDrag, pointOf(event));
      this.rightDrag = drag;
      if (pan) this.applyCamera(panBy(this.camera, pan.dx, pan.dy));
      return;
    }
    if (this.tokenPress) return this.dragToken(event, this.tokenPress);
    if (this.primaryDown) this.onIntent({ kind: 'pointerMove', cell: this.cellAt(event) });
  }

  private dragToken(event: PointerEvent, current: TokenPress): void {
    const { press, dragging } = movePress(current, pointOf(event));
    this.tokenPress = press;
    if (!dragging) return;
    this.tokens.drag(press.tokenId, this.worldOf(event));
    this.reportDragCell(press.tokenId, this.dropCellAt(press.tokenId, event));
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

  private dropCellAt(tokenId: string, event: PointerEvent): Cell | null {
    const size = this.view?.tokens.find(({ id }) => id === tokenId)?.size ?? 1;
    const cells = this.view?.grid.cells;
    return cells ? dropCellOf(cells, size, this.worldOf(event)) : null;
  }

  private releaseToken(event: PointerEvent, press: TokenPress): void {
    this.tokenPress = null;
    this.dragCellKey = null;
    this.tokens.release();
    const { tokenId } = press;
    if (releasePress(press) === 'pick') return this.onIntent({ kind: 'tokenPicked', tokenId });
    this.onIntent({ kind: 'tokenDropped', tokenId, cell: this.dropCellAt(tokenId, event) });
  }

  private onPointerUp(event: PointerEvent): void {
    if (event.button === SECONDARY_BUTTON) this.rightDrag = null;
    if (event.button === PRIMARY_BUTTON && this.tokenPress) {
      return this.releaseToken(event, this.tokenPress);
    }
    if (event.button !== PRIMARY_BUTTON || !this.primaryDown) return;
    this.primaryDown = false;
    this.onIntent({ kind: 'pointerUp', cell: this.cellAt(event) });
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.tokenPress?.dragging) {
      return this.cancelTokenDrag(this.tokenPress);
    }
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

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function pointOf(event: PointerEvent): Point {
  return { x: event.offsetX, y: event.offsetY };
}

function wheelFields(event: WheelEvent): Omit<Parameters<typeof wheelIntent>[0], 'x' | 'y'> {
  const { deltaX, deltaY, deltaMode, ctrlKey, metaKey, shiftKey } = event;
  return { deltaX, deltaY, deltaMode, ctrlKey, metaKey, shiftKey };
}

function cellCenter(target: Readonly<{ col: number; row: number }>): Point {
  const half = CELL_WORLD_SIZE / 2;
  return { x: target.col * CELL_WORLD_SIZE + half, y: target.row * CELL_WORLD_SIZE + half };
}
