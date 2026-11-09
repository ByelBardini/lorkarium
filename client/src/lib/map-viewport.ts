import type { MapPoint } from '@lorkarium/game-core';
import {
  clampToScene,
  fitScene,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAt,
  type Camera,
  type Point,
  type Size,
  type ZoomLimits,
} from '@/renderer/camera';

/** A map is made to be zoomed: wider than the board's range, so 8192 px still fit a small window. */
export const MAP_ZOOM_LIMITS: ZoomLimits = { min: 0.05, max: 8 };

const PIN_RADIUS_PX = 7;
const PIN_MARKER_RADIUS_PX = 15;
const PIN_MARKER_HIT_RADIUS_PX = 22;
const PIN_MARKER_ICON_PX = 18;
const FOCUS_CLOSER_THAN_FIT = 2.5;
const SAME_SPOT_RADIUS_PX = 8;
const CARD_GAP_PX = 16;
const CARD_MARGIN_PX = 12;

/** Where a card goes beside a spot on screen: to its right, or to its left when only that side has
 *  room, and always inside the frame. Beside, never over: the spot must stay free for the second
 *  click of a double click.
 *
 *  Example: `mapCardPosition({ x: 300, y: 200 }, { width: 320, height: 160 }, frame)` */
export function mapCardPosition(spot: Point, card: Size, frame: Size): Point {
  const right = spot.x + CARD_GAP_PX;
  const left = spot.x - CARD_GAP_PX - card.width;
  const fitsRight = right + card.width + CARD_MARGIN_PX <= frame.width;
  return {
    x: insideMargins(fitsRight || left < CARD_MARGIN_PX ? right : left, card.width, frame.width),
    y: insideMargins(spot.y - card.height / 2, card.height, frame.height),
  };
}

// The margin wins over the far edge: a card bigger than the frame shows its start.
function insideMargins(start: number, length: number, room: number): number {
  return Math.max(CARD_MARGIN_PX, Math.min(start, room - length - CARD_MARGIN_PX));
}

/** Where a point of the map (0 to 1) is on screen; the world of a map is its image in pixels.
 *
 *  Example: `mapPointToScreen(camera, { width: 2000, height: 1000 }, { x: 0.5, y: 0.5 })` */
export function mapPointToScreen(camera: Camera, image: Size, point: MapPoint): Point {
  return worldToScreen(camera, { x: point.x * image.width, y: point.y * image.height });
}

/** The point of the map (as a share of the image) under a screen position; past the image's
 *  edges it is below 0 or above 1.
 *
 *  Example: `screenToMapPoint(camera, image, { x: event.offsetX, y: event.offsetY })` */
export function screenToMapPoint(camera: Camera, image: Size, screen: Point): MapPoint {
  const world = screenToWorld(camera, screen);
  return { x: world.x / image.width, y: world.y / image.height };
}

/** Whether two points of the map are under the same fingertip at this zoom.
 *
 *  Example: `sameMapSpot(camera, image, clicked, vertices[0])` */
export function sameMapSpot(camera: Camera, image: Size, a: MapPoint, b: MapPoint): boolean {
  const from = mapPointToScreen(camera, image, a);
  const to = mapPointToScreen(camera, image, b);
  return Math.hypot(from.x - to.x, from.y - to.y) <= SAME_SPOT_RADIUS_PX;
}

/** The camera that shows the whole map, centered in the viewport.
 *
 *  Example: `fitMap({ width: 8192, height: 8192 }, { width: 800, height: 600 })` */
export function fitMap(image: Size, viewport: Size): Camera {
  return fitScene(image, viewport, MAP_ZOOM_LIMITS);
}

/** Moves the view, never so far that the map leaves the screen.
 *
 *  Example: `panMap(camera, { dx: 10, dy: 0 }, image, viewport)` */
export function panMap(
  camera: Camera,
  by: Readonly<{ dx: number; dy: number }>,
  image: Size,
  viewport: Size,
): Camera {
  return clampToScene(panBy(camera, by.dx, by.dy), image, viewport);
}

/** Zooms within the map's limits, keeping the point under `anchor` where it is.
 *
 *  Example: `zoomMapAt(camera, 1.1, { x: 40, y: 80 }, image, viewport)` */
export function zoomMapAt(
  camera: Camera,
  factor: number,
  anchor: Point,
  image: Size,
  viewport: Size,
): Camera {
  return clampToScene(zoomAt(camera, factor, anchor, MAP_ZOOM_LIMITS), image, viewport);
}

/** A point of the map in the middle of the window. A map seen whole comes closer, or centering
 *  would move nothing; a view already close keeps its zoom.
 *
 *  Example: `focusMapOn(camera, regionFocusPoint(region.geometry), image, viewport)` */
export function focusMapOn(camera: Camera, point: MapPoint, image: Size, viewport: Size): Camera {
  const closeEnough = fitMap(image, viewport).zoom * FOCUS_CLOSER_THAN_FIT;
  const zoom = Math.min(Math.max(camera.zoom, closeEnough), MAP_ZOOM_LIMITS.max);
  const centered = {
    zoom,
    offsetX: viewport.width / 2 - point.x * image.width * zoom,
    offsetY: viewport.height / 2 - point.y * image.height * zoom,
  };
  return clampToScene(centered, image, viewport);
}

/** A pin as an SVG circle in the image's pixels, its radius undone by the zoom so it reads the
 *  same on screen at any zoom.
 *
 *  Example: `<circle {...mapPinCircle(point, image, camera.zoom)} />` */
export function mapPinCircle(
  point: MapPoint,
  image: Size,
  zoom: number,
): Readonly<{ cx: number; cy: number; r: number }> {
  return { cx: point.x * image.width, cy: point.y * image.height, r: PIN_RADIUS_PX / zoom };
}

/** A pin as it is drawn on the map, in the image's pixels, the same size on screen at any zoom: the
 *  disc, the icon inside it and a click area past it, for a pin to be easy to hit.
 *
 *  Example: `const { cx, cy, r } = mapPinMarker(point, image, camera.zoom)` */
export function mapPinMarker(
  point: MapPoint,
  image: Size,
  zoom: number,
): Readonly<{ cx: number; cy: number; r: number; hitRadius: number; iconSize: number }> {
  return {
    cx: point.x * image.width,
    cy: point.y * image.height,
    r: PIN_MARKER_RADIUS_PX / zoom,
    hitRadius: PIN_MARKER_HIT_RADIUS_PX / zoom,
    iconSize: PIN_MARKER_ICON_PX / zoom,
  };
}

/** A polygon's vertices in the image's pixels, as the SVG `points` attribute reads them.
 *
 *  Example: `mapPolygonPoints([{ x: 0.5, y: 1 }], { width: 200, height: 100 }) // '100,100'` */
export function mapPolygonPoints(points: readonly MapPoint[], image: Size): string {
  return points.map(({ x, y }) => `${x * image.width},${y * image.height}`).join(' ');
}
