/** A vertex of an outline in the unit cell of a token's art: `[0, 0]` is its top-left corner and
 *  `[1, 1]` the opposite one. */
export type SightOutlinePoint = readonly [number, number];

/** The outline of an image: its islands, each a polygon of unit-cell points, not closed. No
 *  polygon at all is the outline of a fully transparent image. */
export type SightOutline = readonly (readonly SightOutlinePoint[])[];

/** The most vertices an outline has, over all its islands. */
export const SIGHT_OUTLINE_POINTS_MAX = 48;
/** The most separate polygons an outline has. */
export const SIGHT_OUTLINE_ISLANDS_MAX = 4;

const POLYGON_POINTS_MIN = 3;

/** Validates an outline and returns it frozen; anything out of the unit cell or over a ceiling
 *  throws a `RangeError` citing the value and the expected shape.
 *
 *  Example: `sightOutline([[[0.5, 0], [1, 1], [0, 1]]])` */
export function sightOutline(polygons: SightOutline): SightOutline {
  if (polygons.length > SIGHT_OUTLINE_ISLANDS_MAX) {
    throw new RangeError(
      `Sight outline has ${polygons.length} polygons: expected at most ${SIGHT_OUTLINE_ISLANDS_MAX}.`,
    );
  }
  polygons.forEach(assertPolygon);
  assertTotalPoints(polygons);
  return Object.freeze(polygons.map(frozenPolygon));
}

function assertPolygon(polygon: readonly SightOutlinePoint[]): void {
  if (polygon.length < POLYGON_POINTS_MIN) {
    throw new RangeError(
      `Sight outline polygon has ${polygon.length} points: expected at least ${POLYGON_POINTS_MIN}.`,
    );
  }
  polygon.forEach(assertInsideUnitCell);
}

function assertInsideUnitCell([x, y]: SightOutlinePoint): void {
  if (x >= 0 && x <= 1 && y >= 0 && y <= 1) return;
  throw new RangeError(
    `Sight outline point (${String(x)}, ${String(y)}) is invalid: expected x and y from 0 to 1.`,
  );
}

function assertTotalPoints(polygons: SightOutline): void {
  const total = polygons.reduce((sum, polygon) => sum + polygon.length, 0);
  if (total <= SIGHT_OUTLINE_POINTS_MAX) return;
  throw new RangeError(
    `Sight outline has ${total} points: expected at most ${SIGHT_OUTLINE_POINTS_MAX}.`,
  );
}

function frozenPolygon(polygon: readonly SightOutlinePoint[]): readonly SightOutlinePoint[] {
  return Object.freeze(polygon.map(([x, y]): SightOutlinePoint => Object.freeze([x, y] as const)));
}
