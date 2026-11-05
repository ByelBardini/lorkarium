import type { Vector2 } from './facing';
import type { SceneSize } from './grid';
import { insidePolygon } from './sight-area';
import type { SightOutline, SightOutlinePoint } from './sight-outline.vo';
import { ELLIPSE_WALL_SEGMENTS } from './wall-segments';
import { wall, type Wall } from './wall.vo';

/** The ellipse the round frame crops to, as a share of each token side (the disc's radius). */
export const ROUND_RADIUS_SHARE = 0.42;

/** What gives a token its blocking shape. `box` is its footprint in cells; `outline` is the one of
 *  the image's asset (`null` when none was traced), read only with `hasImage` on the square frame. */
export type SightBlockerToken = Readonly<{
  tokenId: string;
  box: Readonly<{ x: number; y: number; width: number; height: number }>;
  frame: 'square' | 'round';
  hasImage: boolean;
  outline: SightOutline | null;
  facing: number;
  flipX: boolean;
  flipY: boolean;
}>;

/** A token that cuts sight and light: `walls` go after the scene's in the one list of sight walls
 *  (each is a closed curtain, one per island); `polygons` are the same shape in absolute cells, not
 *  closed, for what is inside it (the eye standing there, the body the fog opens). */
export type SightBlocker = Readonly<{
  tokenId: string;
  walls: readonly Wall[];
  polygons: readonly (readonly Vector2[])[];
}>;

const RADIANS_PER_DEGREE = Math.PI / 180;
const UNIT_RECTANGLE: readonly SightOutlinePoint[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
const UNIT_ELLIPSE: readonly SightOutlinePoint[] = Array.from(
  { length: ELLIPSE_WALL_SEGMENTS },
  (_, step) => {
    const angle = (2 * Math.PI * step) / ELLIPSE_WALL_SEGMENTS;
    return [
      0.5 + ROUND_RADIUS_SHARE * Math.cos(angle),
      0.5 + ROUND_RADIUS_SHARE * Math.sin(angle),
    ] as const;
  },
);
const NO_WALLS: readonly Wall[] = Object.freeze([]);

/** The walls and the polygons of a token that blocks sight, by what is seen of it: the traced
 *  outline of an image on the square frame (the footprint rectangle when it has no outline or an
 *  empty one), the disc on the round frame and, with no image, the rectangle or the disc. The shape
 *  follows the art (stretch with the footprint, mirror, turn around the center), but a token with
 *  no image never turns: its initials do not. Points leaving the scene are held on its border.
 *
 *  Example: `sightBlockerOf({ tokenId, box: { x: 3, y: 3, width: 2, height: 2 }, frame: 'square', hasImage: true, outline, facing: 0, flipX: false, flipY: false }, scene)` */
export function sightBlockerOf(token: SightBlockerToken, scene: SceneSize): SightBlocker {
  const polygons = unitPolygonsOf(token).map((polygon) =>
    polygon.map((point) => clampedToScene(posedPoint(point, token), scene)),
  );
  return { tokenId: token.tokenId, walls: polygons.map(curtainAround), polygons };
}

/** The walls a point leaves out of its sight: those of every blocker it stands inside and those of
 *  the token `ownId`, which never blocks itself even with its center out of its own shape. Eyes and
 *  lights take this as `ignores`. No blocker to leave out gives one shared empty list, and a single
 *  one its own `walls`, so nothing is allocated.
 *
 *  Example: `eyeOf(center, range, field, blockersIgnoredAt(center, blockers, token.id))` */
export function blockersIgnoredAt(
  point: Vector2,
  blockers: readonly SightBlocker[],
  ownId: string | null = null,
): readonly Wall[] {
  let ignored = NO_WALLS;
  for (const blocker of blockers) {
    if (blocker.tokenId !== ownId && !standsInside(point, blocker)) continue;
    ignored = ignored.length === 0 ? blocker.walls : [...ignored, ...blocker.walls];
  }
  return ignored;
}

function standsInside(point: Vector2, { polygons }: SightBlocker): boolean {
  return polygons.some((polygon) => insidePolygon(point, polygon));
}

function unitPolygonsOf({ frame, hasImage, outline }: SightBlockerToken): SightOutline {
  // With no image the token is drawn as the disc whatever its frame: it blocks what is seen.
  if (frame === 'round' || !hasImage) return [UNIT_ELLIPSE];
  if (!outline || outline.length === 0) return [UNIT_RECTANGLE];
  return outline;
}

// The same order as the art: stretched with the token, mirrored, then turned around its center.
function posedPoint([u, v]: SightOutlinePoint, token: SightBlockerToken): Vector2 {
  const { x, y, width, height } = token.box;
  const across = (u - 0.5) * width * (token.flipX ? -1 : 1);
  const down = (v - 0.5) * height * (token.flipY ? -1 : 1);
  const radians = (token.hasImage ? token.facing : 0) * RADIANS_PER_DEGREE;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: x + width / 2 + across * cos - down * sin,
    y: y + height / 2 + across * sin + down * cos,
  };
}

function clampedToScene({ x, y }: Vector2, { widthCells, heightCells }: SceneSize): Vector2 {
  return { x: Math.min(Math.max(x, 0), widthCells), y: Math.min(Math.max(y, 0), heightCells) };
}

function curtainAround(polygon: readonly Vector2[]): Wall {
  const x = Math.min(...polygon.map((point) => point.x));
  const y = Math.min(...polygon.map((point) => point.y));
  const relative = polygon.map((point) => [point.x - x, point.y - y] as const);
  return wall({
    kind: 'curtain',
    shape: 'freehand',
    x,
    y,
    width: Math.max(...relative.map(([across]) => across)),
    height: Math.max(...relative.map(([, down]) => down)),
    points: [...relative, ...relative.slice(0, 1)],
    doorState: null,
  });
}
