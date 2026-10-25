import { Application, Container } from 'pixi.js';
import { NO_PERF_PROBE, type PerfProbe } from '@/lib/perf-probe';
import type {
  BoardIntentListener,
  BoardRenderer,
  CreateBoardRenderer,
  PingMark,
} from './board-renderer';
import { auraMotionOf } from './aura-motion';
import { auraImageUrlsOf } from './aura-view';
import { boardCursorOf } from './board-cursor';
import { imageUrlsOf, type BoardView } from './board-view';
import {
  centeredOn,
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
  endRightDrag,
  keyboardPan,
  moveRightDrag,
  panKeyOf,
  startRightDrag,
  wheelIntent,
  type PanKey,
  type RightDrag,
} from './camera-input';
import { FrameWork } from './frame-work';
import { followHostSize, holdBackBrowserMenu } from './host-listeners';
import { cellAtWorld, visibleWorldRect } from './grid-geometry';
import { DrawingGestures } from './drawing-gestures';
import { EffectAreaGestures } from './effect-area-gestures';
import { LightGestures } from './light-gestures';
import { erasedStrokesOf, wallTargetAt } from './wall-view';
import { pointOf, prefersReducedMotion, wheelFields } from './dom-input';
import { HoverReport, tokenScreenRect, type HoveredToken } from './hover-report';
import { hoverRouteOf, menuRouteOf } from './press-route';
import { PrimaryPress, type PressContext, type PressPoint } from './primary-press';
import { tokenCenterOf } from './token-box';
import { PixiDrawingLayer } from './pixi-drawing-layer';
import { PixiEffectAreaLayer } from './pixi-effect-area-layer';
import { PixiBoardOverlays } from './pixi-board-overlays';
import { PixiFogLayer } from './pixi-fog-layer';
import { PixiLightTintLayer } from './pixi-light-tint-layer';
import { PixiPingLayer, type PingFrame } from './pixi-ping-layer';
import { resizeCursorOf } from './resize-handles';
import { PixiSceneBackground } from './pixi-scene-background';
import { PixiSceneGrid } from './pixi-scene-grid';
import { PixiAuraAnimator, type AuraMotionFrame } from './pixi-aura-animator';
import { PixiAuraSources } from './pixi-aura-sources';
import { pixiAuraDecoding } from './pixi-aura-decoding';
import { PixiTextureCache } from './pixi-texture-cache';
import { PixiTokenLayer } from './pixi-token-layer';

// Design system tokens (client/src/index.css): the canvas cannot read CSS variables.
const PANEL_COLOR = 0x0c0e11;
const BUTTON_ZOOM_STEP = 1.25;
const SECONDARY_BUTTON = 2;
const PRIMARY_BUTTON = 0;

/** The PixiJS board, as `AppDependencies.createBoardRenderer` in the app; the dev panel
 *  (`?perf=1`) hands it a recording probe, and `auraMotion` says whether "Animar auras" is on
 *  (read by the animator each frame, never through the view: toggling it redraws nothing).
 *
 *  Example: `buildRoutes({ ...deps, createBoardRenderer: (onIntent) => createPixiBoardRenderer(onIntent, probe, () => store.getState().animated) })` */
export function createPixiBoardRenderer(
  onIntent: Parameters<CreateBoardRenderer>[0],
  probe: PerfProbe = NO_PERF_PROBE,
  auraMotion: () => boolean = () => true,
): BoardRenderer {
  return new PixiBoardRenderer(onIntent, probe, auraMotion);
}

/** Thin shell over PixiJS: every decision (camera math, input mapping, grid lines, what to draw)
 *  is in the pure modules beside it; this only wires them to the canvas. Proven by the e2e. */
class PixiBoardRenderer implements BoardRenderer {
  private app: Application | null = null;
  private destroyed = false;
  private camera: Camera = { offsetX: 0, offsetY: 0, zoom: 1 };
  private view: BoardView | null = null;
  private framed = false;
  private rightDrag: RightDrag | null = null;
  private readonly hover = new HoverReport((intent) => this.onIntent(intent));
  private readonly drawings = new PixiDrawingLayer();
  private readonly effectAreas = new PixiEffectAreaLayer();
  private readonly lightTint = new PixiLightTintLayer();
  private readonly fog = new PixiFogLayer();
  private readonly pings = new PixiPingLayer(prefersReducedMotion);
  private readonly overlays = new PixiBoardOverlays((intent) => this.onIntent(intent));
  private readonly lightGestures = new LightGestures((intent) => this.onIntent(intent));
  // Every change only marks what to redraw; the ticker draws once per frame (`flush`).
  private readonly frame = new FrameWork();
  // A background that arrives draws the view again; a token image only the tokens showing it.
  private readonly textures = new PixiTextureCache(
    this.frame.touching((url: string) => this.textureArrived(url)),
  );
  // Aura images load apart (a GIF is told by its bytes); one arriving draws only its auras.
  private readonly auraSources = new PixiAuraSources(
    this.frame.touching((url: string) => this.tokens.refreshAura(url)),
    pixiAuraDecoding(),
  );
  private readonly background = new PixiSceneBackground(this.textures);
  private readonly tokens: PixiTokenLayer;
  private readonly gestures = new DrawingGestures(this.drawings, (intent) => this.onIntent(intent));
  private readonly areaGestures = new EffectAreaGestures(this.effectAreas, (intent) =>
    this.onIntent(intent),
  );
  private readonly press: PrimaryPress;
  // Steps only the animated auras on screen, at most 30 times per second.
  private readonly auraAnimator = new PixiAuraAnimator(() => this.tokens.animatedAuras());
  private readonly heldPanKeys = new Set<PanKey>();
  private readonly disposers: Array<() => void> = [];
  private readonly world = new Container();
  private readonly sceneGrid = new PixiSceneGrid();

  constructor(
    private readonly onIntent: BoardIntentListener,
    private readonly probe: PerfProbe,
    private readonly auraMotion: () => boolean,
  ) {
    const beneath = this.effectAreas.under(this.drawings.layer);
    const { textures, auraSources } = this;
    this.tokens = new PixiTokenLayer(prefersReducedMotion, beneath, textures, probe, auraSources);
    this.press = new PrimaryPress({
      overlays: this.overlays,
      lights: this.lightGestures,
      sketches: this.gestures,
      areas: this.areaGestures,
      tokens: this.tokens,
      onIntent: (intent) => this.onIntent(intent),
    });
  }

  async mount(host: HTMLElement): Promise<void> {
    const app = new Application();
    // WebGL even where WebGPU exists: the aura shaders are GLSL only (WebGPU would ask for WGSL).
    const options = { resizeTo: host, background: PANEL_COLOR, antialias: true, autoDensity: true };
    await app.init({ ...options, preference: 'webgl' });
    // Unmounted while `init` ran (StrictMode does it on purpose): tear down what init built.
    if (this.destroyed) return void app.destroy(true, { children: true });
    this.app = app;
    host.appendChild(app.canvas);
    const { container: tokenLayer } = this.tokens;
    const sketches = [this.drawings.draft, this.effectAreas.draft];
    this.world.addChild(
      this.sceneGrid.floor,
      this.background.container,
      this.sceneGrid.grid,
      tokenLayer,
      this.lightTint.container,
      this.fog.container,
      ...this.overlays.containers(sketches),
      this.pings.world,
    );
    app.stage.addChild(this.world, this.pings.edges);
    this.listen(host, app.canvas);
    this.disposers.push(followHostSize(host, app));
    app.ticker.remove(app.render, app);
    app.ticker.add((ticker) => {
      this.probe.frame(ticker.deltaMS);
      this.panWithKeys(ticker.deltaMS);
      const now = performance.now();
      this.press.tick(this.pressContext(), now);
      this.flush();
      const pinging = this.pings.animate(ticker.deltaMS, this.pingFrame());
      const auras = this.auraAnimator.animate(now, () => this.auraFrame());
      if (this.tokens.animate(now) || pinging || auras || this.frame.renderDue()) app.render();
    });
    app.renderer.on('resize', () => this.applyCamera(this.camera));
    if (this.view) this.draw(this.view);
  }

  // Kept and marked: a burst of views in one frame is drawn once, by the ticker.
  draw(view: BoardView): void {
    this.view = view;
    this.frame.viewChanged();
    if (!this.app || this.framed) return;
    this.framed = true;
    this.fitScene();
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
    const moved = centeredOn(this.camera, center, this.screenSize());
    if (moved) this.applyCamera(moved);
  }

  viewCenterCell(): ReturnType<typeof cellAtWorld> {
    if (!this.view) return null;
    const { width, height } = this.screenSize();
    const center = screenToWorld(this.camera, { x: width / 2, y: height / 2 });
    return cellAtWorld(this.view.grid.cells, center);
  }

  // Only kept: the ticker draws it (`animate`), like the tokens that glide.
  showPing(ping: PingMark): void {
    this.pings.show(ping);
  }

  destroy(): void {
    this.destroyed = true;
    for (const dispose of this.disposers.splice(0)) dispose();
    this.textures.destroy();
    this.auraSources.destroy();
    this.lightTint.destroy();
    this.fog.destroy();
    this.app?.destroy(true, { children: true });
    this.app = null;
  }

  // Moving the world is cheap and happens now; what the move needs redrawn waits for the frame.
  private applyCamera(next: Camera): void {
    const scene = this.view?.sceneSize;
    const zoomChanged = next.zoom !== this.camera.zoom;
    this.camera = scene ? clampToScene(next, scene, this.screenSize()) : next;
    this.world.position.set(this.camera.offsetX, this.camera.offsetY);
    this.world.scale.set(this.camera.zoom);
    if (zoomChanged) this.tokens.applyZoom(this.camera.zoom);
    this.hover.camera(this.camera);
    const gridBandLeft = this.view
      ? this.sceneGrid.leavesBand(this.view, this.camera, this.screenSize())
      : false;
    this.frame.cameraChanged({ zoomChanged, gridBandLeft });
    this.onIntent({ kind: 'cameraChanged', zoom: this.camera.zoom });
  }

  private flush(): void {
    const view = this.view;
    if (!this.app || !view || !this.frame.pending()) return;
    const job = this.frame.take();
    if (job.view) this.drawView(view, this.app);
    if (job.grid) {
      this.probe.count('grid.draw');
      this.sceneGrid.drawGrid(view, this.camera, this.screenSize());
    }
    if (job.overlays) {
      this.probe.count('overlays.draw');
      this.overlays.draw(view, this.camera.zoom);
    }
  }

  private textureArrived(url: string): void {
    if (this.view?.background?.url === url) return this.frame.viewChanged();
    this.tokens.refreshArt(url);
  }

  private drawView(view: BoardView, app: Application): void {
    this.probe.count('view.draw');
    this.sceneGrid.drawFloor(view);
    this.textures.retain(imageUrlsOf(view));
    this.auraSources.retain(auraImageUrlsOf(view.tokens));
    this.background.sync(view.background);
    this.showCursor();
    this.drawings.sync(view.drawings);
    this.effectAreas.sync(view.effectAreas, view.sceneSize);
    this.tokens.sync(view.tokens, view.ghosts, performance.now());
    this.lightTint.sync(view.lightTint, app.renderer);
    this.fog.sync(view.fog, app.renderer);
  }

  private listen(host: HTMLElement, canvas: HTMLCanvasElement): void {
    this.on(canvas, 'wheel', (event) => this.onWheel(event), { passive: false });
    this.disposers.push(holdBackBrowserMenu(host));
    this.on(canvas, 'pointerdown', (event) => this.onPointerDown(event, canvas));
    this.on(canvas, 'pointermove', (event) => this.onPointerMove(event));
    this.on(canvas, 'pointerup', (event) => this.onPointerUp(event));
    this.on(canvas, 'pointerleave', () => {
      this.hover.left();
      this.tokens.hover(null);
    });
    // Keys on the focusable host, not on the window: typing elsewhere never moves the board.
    this.on(host, 'keydown', (event) => this.onKeyDown(event));
    this.on(host, 'keyup', (event) => this.onKeyUp(event));
    this.on(host, 'blur', () => this.heldPanKeys.clear());
  }

  private showCursor(): void {
    if (!this.app || !this.view) return;
    const drawKind = this.view.sketch?.kind ?? null;
    const panning = this.rightDrag?.panning ?? false;
    this.app.canvas.style.cursor = boardCursorOf({
      tool: this.view.tool,
      drawKind,
      panning,
      wallMode: this.view.wallMode,
    });
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
    this.press.down(this.pressContext(), this.pressPointOf(event));
  }

  private onPointerMove(event: PointerEvent): void {
    if (this.rightDrag) {
      const { drag, pan } = moveRightDrag(this.rightDrag, pointOf(event));
      this.rightDrag = drag;
      if (pan) this.applyCamera(panBy(this.camera, pan.dx, pan.dy));
      if (pan) this.showCursor();
      return;
    }
    const at = this.pressPointOf(event);
    if (this.press.move(this.pressContext(), at)) return;
    const pressed = event.buttons !== 0;
    const token = pressed ? null : this.hoveredToken(this.hoverAt(event));
    this.hover.moved({ cell: at.cell, pressed, token });
    this.press.pointerMoved(at);
  }

  // The name of the token under the pointer and the stretch cursor over a handle.
  // Answers the token under the pointer, whose card the room may show.
  private hoverAt(event: PointerEvent): string | null {
    const world = this.worldOf(event);
    if (!this.view) return null;
    const { tokenId, handle } = hoverRouteOf(this.view, world, this.camera.zoom);
    this.tokens.hover(tokenId);
    const target = wallTargetAt(this.view.walls, world);
    this.overlays.walls.lightErase(erasedStrokesOf(this.view.walls, target, this.view.wallMode));
    if (!handle || !this.app) this.showCursor();
    else this.app.canvas.style.cursor = resizeCursorOf(handle);
    return tokenId;
  }

  private hoveredToken(tokenId: string | null): HoveredToken | null {
    const token = this.view?.tokens.find(({ id }) => id === tokenId);
    if (!token || !this.app) return null;
    const origin = this.app.canvas.getBoundingClientRect();
    return { tokenId: token.id, rect: tokenScreenRect(token, this.camera, origin) };
  }

  private onPointerUp(event: PointerEvent): void {
    if (event.button === SECONDARY_BUTTON) return this.endRightClick(event);
    if (event.button !== PRIMARY_BUTTON) return;
    this.press.up(this.pressContext(), this.pressPointOf(event));
  }

  // Dragged, the right button moved the camera; a short click asks for the token menu.
  private endRightClick(event: PointerEvent): void {
    const drag = this.rightDrag;
    this.rightDrag = null;
    this.showCursor();
    if (!drag || !this.view || endRightDrag(drag) !== 'context') return;
    const menu = menuRouteOf(this.view, this.worldOf(event), this.camera.zoom);
    const at = { x: event.clientX, y: event.clientY };
    if (menu?.kind === 'light') {
      this.onIntent({ kind: 'lightMenuRequested', lightId: menu.lightId, ...at });
    }
    if (menu?.kind === 'door')
      this.onIntent({ kind: 'doorMenuRequested', wallId: menu.wallId, ...at });
    if (menu?.kind === 'token')
      this.onIntent({ kind: 'tokenMenuRequested', tokenId: menu.tokenId, ...at });
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.press.cancel()) return;
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

  private pressContext(): PressContext {
    return { view: this.view, zoom: this.camera.zoom };
  }

  private pressPointOf(event: PointerEvent): PressPoint {
    const { shiftKey, altKey, ctrlKey, metaKey, timeStamp: time } = event;
    const keys = { shiftKey, altKey, ctrlKey, metaKey };
    const screen = pointOf(event);
    return { screen, world: this.worldOf(event), cell: this.cellAt(event), ...keys, time };
  }

  private auraFrame(): AuraMotionFrame {
    const enabled = this.auraMotion();
    const playing = auraMotionOf({ enabled, reducedMotion: prefersReducedMotion() }) === 'playing';
    return { visible: visibleWorldRect(this.camera, this.screenSize()), playing };
  }

  private pingFrame(): PingFrame {
    return { camera: this.camera, screen: this.screenSize() };
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
    const touching = this.frame.touching(listener);
    target.addEventListener(type, touching, options);
    this.disposers.push(() => target.removeEventListener(type, touching, options));
  }
}
