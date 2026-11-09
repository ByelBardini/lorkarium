import { insidePolygon } from './sight-area';

/** A point on a library map, as a share of the image: `{ x: 0, y: 0 }` is its top-left corner and
 *  `{ x: 1, y: 1 }` the opposite one, so a region survives any image size, zoom or pan. */
export type MapPoint = { x: number; y: number };

// Mutable in the type because this is also the shape of the DTO and of the jsonb column, which a
// readonly array would not be assignable to. The validated value is frozen at runtime.
/** Where a region is on its map: an area, or a single spot (a city on a world map). */
export type MapRegionGeometry =
  { shape: 'polygon'; points: MapPoint[] } | { shape: 'pin'; point: MapPoint };

/** What `regionsPaintOrder` needs of a region; the caller's other fields come back untouched. */
export type PaintableMapRegion = Readonly<{ id: string; geometry: MapRegionGeometry }>;

export const MAP_NAME_MAX_LENGTH = 60;
export const MAP_REGION_NAME_MAX_LENGTH = 60;
export const MAP_REGION_DESCRIPTION_MAX_LENGTH = 500;
export const MAP_REGIONS_MAX = 300;
export const MAP_POLYGON_VERTICES_MIN = 3;
export const MAP_POLYGON_VERTICES_MAX = 1024;

// Over the rounding noise of collinear points (near 1e-17) and well under one pixel of the largest
// map (1 / 8192², near 1.5e-8), so no region anybody can draw is refused.
const POLYGON_AREA_MIN = 1e-12;
// Below any polygon's area, so pins are painted after every polygon.
const PIN_PAINT_SIZE = -1;

/** Validates a region's geometry and returns a frozen copy; anything else throws a `RangeError`
 *  citing the value and the expected shape.
 *
 *  Example: `mapRegionGeometry({ shape: 'pin', point: { x: 0.5, y: 0.5 } })` */
export function mapRegionGeometry(geometry: MapRegionGeometry): MapRegionGeometry {
  if (geometry.shape === 'pin') {
    return Object.freeze({ shape: 'pin', point: validPoint(geometry.point) });
  }
  assertVertexCount(geometry.points.length);
  const points = geometry.points.map(validPoint);
  assertHasArea(points);
  return Object.freeze({ shape: 'polygon', points: Object.freeze(points) as MapPoint[] });
}

function validPoint({ x, y }: MapPoint): MapPoint {
  if (x >= 0 && x <= 1 && y >= 0 && y <= 1) return Object.freeze({ x, y });
  throw new RangeError(
    `Map point (${String(x)}, ${String(y)}) is invalid: expected x and y from 0 to 1.`,
  );
}

function assertVertexCount(vertices: number): void {
  if (vertices >= MAP_POLYGON_VERTICES_MIN && vertices <= MAP_POLYGON_VERTICES_MAX) return;
  throw new RangeError(
    `Map polygon has ${vertices} vertices: expected ${MAP_POLYGON_VERTICES_MIN} to ${MAP_POLYGON_VERTICES_MAX}.`,
  );
}

function assertHasArea(points: readonly MapPoint[]): void {
  const area = polygonArea(points);
  if (area > POLYGON_AREA_MIN) return;
  throw new RangeError(
    `Map polygon has area ${area}: expected more than ${POLYGON_AREA_MIN} (not all on one line).`,
  );
}

/** The area of a polygon, as a share of the map, whichever way it was drawn.
 *
 *  Example: `polygonArea([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }])` → `0.5` */
export function polygonArea(points: readonly MapPoint[]): number {
  return Math.abs(signedArea(points));
}

function signedArea(points: readonly MapPoint[]): number {
  return edgesOf(points).reduce((sum, [from, to]) => sum + crossOf(from, to), 0) / 2;
}

function edgesOf(points: readonly MapPoint[]): (readonly [MapPoint, MapPoint])[] {
  return points.map((from, index) => [from, points[(index + 1) % points.length] ?? from] as const);
}

function crossOf(from: MapPoint, to: MapPoint): number {
  return from.x * to.y - to.x * from.y;
}

/** Where to center the view on a region: the pin's own point, or the polygon's center of mass (on
 *  a very concave polygon, a C for example, that point can fall outside it). Takes a validated
 *  geometry: a polygon of no area has no center.
 *
 *  Example: `regionFocusPoint({ shape: 'pin', point: { x: 0.2, y: 0.7 } })` → `{ x: 0.2, y: 0.7 }` */
export function regionFocusPoint(geometry: MapRegionGeometry): MapPoint {
  if (geometry.shape === 'pin') return geometry.point;
  return centerOfMass(geometry.points);
}

function centerOfMass(points: readonly MapPoint[]): MapPoint {
  const moment = edgesOf(points).reduce(
    (sum, [from, to]) => ({
      x: sum.x + (from.x + to.x) * crossOf(from, to),
      y: sum.y + (from.y + to.y) * crossOf(from, to),
    }),
    { x: 0, y: 0 },
  );
  const sixAreas = 6 * signedArea(points);
  return { x: moment.x / sixAreas, y: moment.y / sixAreas };
}

/** The regions in the order to paint them: biggest polygon first, so a smaller one lying over it
 *  stays visible and clickable, and pins last. Ties go by id, the same order everywhere. The list
 *  received stays as it was.
 *
 *  Example: `regionsPaintOrder([city, kingdom, inn])` → `[kingdom, city, inn]` */
export function regionsPaintOrder<Region extends PaintableMapRegion>(
  regions: readonly Region[],
): Region[] {
  return regions
    .map((region) => ({ region, size: paintSizeOf(region.geometry) }))
    .sort((a, b) => b.size - a.size || compareIds(a.region.id, b.region.id))
    .map(({ region }) => region);
}

/** Which region each region lies inside: the smallest polygon around all of it. A region that only
 *  overlaps another, or lies inside nothing, has no entry.
 *
 *  Example: `mapRegionParents([kingdom, city]).get(city.id)` → `kingdom.id` */
export function mapRegionParents(
  regions: readonly PaintableMapRegion[],
): ReadonlyMap<string, string> {
  const enclosures = enclosuresSmallestFirst(regions);
  const parents = new Map<string, string>();
  for (const region of regions) {
    const parent = enclosures.find((enclosure) => encloses(enclosure, region));
    if (parent) parents.set(region.id, parent.id);
  }
  return parents;
}

type MapRegionEnclosure = Readonly<{ id: string; points: readonly MapPoint[]; size: number }>;

function enclosuresSmallestFirst(regions: readonly PaintableMapRegion[]): MapRegionEnclosure[] {
  return regions
    .flatMap(({ id, geometry }) =>
      geometry.shape === 'polygon'
        ? [{ id, points: geometry.points, size: polygonArea(geometry.points) }]
        : [],
    )
    .sort((a, b) => a.size - b.size || compareIds(a.id, b.id));
}

// Strictly bigger: two equal polygons would otherwise each be the other's parent.
function encloses(enclosure: MapRegionEnclosure, region: PaintableMapRegion): boolean {
  if (enclosure.size <= paintSizeOf(region.geometry)) return false;
  return pointsOf(region.geometry).every((point) => insidePolygon(point, enclosure.points));
}

function pointsOf(geometry: MapRegionGeometry): readonly MapPoint[] {
  return geometry.shape === 'pin' ? [geometry.point] : geometry.points;
}

function paintSizeOf(geometry: MapRegionGeometry): number {
  return geometry.shape === 'pin' ? PIN_PAINT_SIZE : polygonArea(geometry.points);
}

// Not `localeCompare`: it depends on the locale, and every client must paint the same order.
function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
