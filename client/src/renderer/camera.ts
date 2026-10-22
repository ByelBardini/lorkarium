/** World units of one grid cell; the scene is `widthCells × CELL_WORLD_SIZE` wide in the world. */
export const CELL_WORLD_SIZE = 64;

export const ZOOM_LIMITS = { min: 0.25, max: 4 } as const;

/** Raster resolution for canvas text inside the zoomed world: drawn for the deepest zoom on this
 *  screen, so zooming in never magnifies its pixels.
 *
 *  Example: `new Text({ text, resolution: zoomProofTextResolution(window.devicePixelRatio) })` */
export function zoomProofTextResolution(devicePixelRatio: number): number {
  return ZOOM_LIMITS.max * Math.max(1, devicePixelRatio);
}

// Screen pixels left around the scene when it is framed.
const FIT_MARGIN_PX = 32;

// The part of the scene that always stays on screen, so it can never be panned out of reach.
const MIN_VISIBLE_SHARE = 0.25;

/** Screen = world × zoom + offset. Plain value: every function returns a new camera. */
export type Camera = Readonly<{ offsetX: number; offsetY: number; zoom: number }>;

export type Point = Readonly<{ x: number; y: number }>;

export type Size = Readonly<{ width: number; height: number }>;

/** Example: `worldToScreen(camera, { x: 64, y: 0 }) // where cell (1, 0) starts on screen` */
export function worldToScreen(camera: Camera, world: Point): Point {
  return { x: world.x * camera.zoom + camera.offsetX, y: world.y * camera.zoom + camera.offsetY };
}

/** Example: `screenToWorld(camera, { x: event.offsetX, y: event.offsetY })` */
export function screenToWorld(camera: Camera, screen: Point): Point {
  return {
    x: (screen.x - camera.offsetX) / camera.zoom,
    y: (screen.y - camera.offsetY) / camera.zoom,
  };
}

/** Example: `panBy(camera, -event.deltaX, -event.deltaY)` */
export function panBy(camera: Camera, dx: number, dy: number): Camera {
  return { ...camera, offsetX: camera.offsetX + dx, offsetY: camera.offsetY + dy };
}

/** Multiplies the zoom by `factor` (within `ZOOM_LIMITS`), keeping the world point under
 *  `anchor` where it is on screen: zooming follows the cursor.
 *
 *  Example: `zoomAt(camera, 1.1, { x: event.offsetX, y: event.offsetY })` */
export function zoomAt(camera: Camera, factor: number, anchor: Point): Camera {
  const zoom = clampZoom(camera.zoom * factor);
  const world = screenToWorld(camera, anchor);
  return { zoom, offsetX: anchor.x - world.x * zoom, offsetY: anchor.y - world.y * zoom };
}

/** The camera that shows the whole scene centered, with a margin ("Enquadrar cena", key 0).
 *
 *  Example: `fitScene({ width: 20 * CELL_WORLD_SIZE, height: 12 * CELL_WORLD_SIZE }, viewport)` */
export function fitScene(scene: Size, viewport: Size): Camera {
  const room = (length: number): number => Math.max(length - 2 * FIT_MARGIN_PX, 1);
  const zoom = clampZoom(
    Math.min(room(viewport.width) / scene.width, room(viewport.height) / scene.height),
  );
  return {
    zoom,
    offsetX: (viewport.width - scene.width * zoom) / 2,
    offsetY: (viewport.height - scene.height * zoom) / 2,
  };
}

/** The camera that brings `world` to the middle of the screen at the same zoom, or `null` when
 *  the point is already on screen (a row picked in the panel moves the board only when needed).
 *
 *  Example: `centeredOn(camera, tokenCenterOf(token), viewport) ?? camera` */
export function centeredOn(camera: Camera, world: Point, viewport: Size): Camera | null {
  const screen = worldToScreen(camera, world);
  const inside =
    screen.x >= 0 && screen.x <= viewport.width && screen.y >= 0 && screen.y <= viewport.height;
  if (inside) return null;
  const { zoom } = camera;
  return {
    zoom,
    offsetX: viewport.width / 2 - world.x * zoom,
    offsetY: viewport.height / 2 - world.y * zoom,
  };
}

/** Pulls the camera back so at least a quarter of the scene stays on screen on each axis.
 *
 *  Example: `clampToScene(panBy(camera, dx, dy), scene, viewport)` */
export function clampToScene(camera: Camera, scene: Size, viewport: Size): Camera {
  return {
    ...camera,
    offsetX: clampAxis(camera.offsetX, scene.width * camera.zoom, viewport.width),
    offsetY: clampAxis(camera.offsetY, scene.height * camera.zoom, viewport.height),
  };
}

function clampAxis(offset: number, sceneLength: number, viewportLength: number): number {
  const keep = Math.min(sceneLength * MIN_VISIBLE_SHARE, viewportLength);
  return Math.min(Math.max(offset, keep - sceneLength), viewportLength - keep);
}

function clampZoom(zoom: number): number {
  return Math.min(Math.max(zoom, ZOOM_LIMITS.min), ZOOM_LIMITS.max);
}
