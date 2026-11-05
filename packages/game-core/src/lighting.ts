import type { Cone } from './cone.vo';
import type { Vector2 } from './facing';
import type { LightRange } from './light.vo';
import { leftOutWith, lineOfSight, type WallsLeftOut } from './sight-area';
import { insideCone } from './view-field';
import type { SightLevel } from './token-sight';
import type { Wall } from './wall.vo';

/** A light that is shining: where it comes from (a map light's point, a token's center), how far,
 *  and the `cone` it shines in (`null` = every side). `ignores` are the walls it shines through
 *  (those of the blockers it stands in, `blockersIgnoredAt`). */
export type LightSource = Readonly<{
  center: Vector2;
  range: LightRange;
  cone: Cone | null;
  ignores?: readonly Wall[];
}>;

// Points are stored to 0.01 cell; the tolerance keeps a point exactly at the edge inside it.
const EDGE_TOLERANCE = 1e-9;

/** The source a light gives off, or `null` when there is no light or it is out. Without a `cone`
 *  it shines every side. Empty `ignores` leave the source as if none were given.
 *
 *  Example: `lightSource({ x: 3.5, y: 2.5 }, lightRange(4, 4), true)` → `{ center: { x: 3.5, y: 2.5 }, range: { bright: 4, dim: 4 }, cone: null }` */
export function lightSource(
  center: Vector2,
  range: LightRange | null,
  lit: boolean,
  cone: Cone | null = null,
  ignores?: readonly Wall[],
): LightSource | null {
  if (!range || !lit) return null;
  return ignores && ignores.length > 0 ? { center, range, cone, ignores } : { center, range, cone };
}

/** How lit a point is: `seen` within `bright` of a light, `silhouette` within `bright + dim`,
 *  `hidden` in the dark. Only a light with line of sight to the point counts (the walls that
 *  block sight block light, but for `except`, one or a list: a door is lit through itself, a
 *  blocker through its outline, and for the `ignores` of each light), and a lantern only within
 *  its cone (its apex counts); the best wins.
 *
 *  Example: `lightLevelAt({ x: 8, y: 5 }, [torchAt5x5], [])` → `'silhouette'` (bright 2, dim 2) */
export function lightLevelAt(
  point: Vector2,
  lights: readonly LightSource[],
  walls: readonly Wall[],
  except?: WallsLeftOut,
): SightLevel {
  let best: SightLevel = 'hidden';
  for (const light of lights) {
    const level = levelFrom(light, point);
    if (level === 'hidden' || level === best) continue;
    if (!lineOfSight(light.center, point, walls, leftOutWith(except, light.ignores))) continue;
    if (level === 'seen') return level;
    best = level;
  }
  return best;
}

// The distance first: most lights of a scene are far from a given point, and the cone costs more.
function levelFrom({ center, range, cone }: LightSource, point: Vector2): SightLevel {
  const distance = Math.hypot(point.x - center.x, point.y - center.y) - EDGE_TOLERANCE;
  if (distance > range.bright + range.dim) return 'hidden';
  if (!insideCone(cone, center, point)) return 'hidden';
  return distance <= range.bright ? 'seen' : 'silhouette';
}
