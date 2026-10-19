import type { Vector2 } from './facing';
import type { LightRange } from './light.vo';
import { lineOfSight } from './sight-area';
import type { SightLevel } from './token-sight';
import type { Wall } from './wall.vo';

/** A light that is shining: where it comes from (a map light's point, a token's center) and how far. */
export type LightSource = Readonly<{ center: Vector2; range: LightRange }>;

// Points are stored to 0.01 cell; the tolerance keeps a point exactly at the edge inside it.
const EDGE_TOLERANCE = 1e-9;

/** The source a light gives off, or `null` when there is no light or it is out.
 *
 *  Example: `lightSource({ x: 3.5, y: 2.5 }, lightRange(4, 4), true)` → `{ center: { x: 3.5, y: 2.5 }, range: { bright: 4, dim: 4 } }` */
export function lightSource(
  center: Vector2,
  range: LightRange | null,
  lit: boolean,
): LightSource | null {
  if (!range || !lit) return null;
  return { center, range };
}

/** How lit a point is: `seen` within `bright` of a light, `silhouette` within `bright + dim`,
 *  `hidden` in the dark. Only a light with line of sight to the point counts (the walls that
 *  block sight block light); the best light wins.
 *
 *  Example: `lightLevelAt({ x: 8, y: 5 }, [torchAt5x5], [])` → `'silhouette'` (bright 2, dim 2) */
export function lightLevelAt(
  point: Vector2,
  lights: readonly LightSource[],
  walls: readonly Wall[],
): SightLevel {
  let best: SightLevel = 'hidden';
  for (const light of lights) {
    const level = levelFrom(light, point);
    if (level === 'hidden' || level === best) continue;
    if (!lineOfSight(light.center, point, walls)) continue;
    if (level === 'seen') return level;
    best = level;
  }
  return best;
}

function levelFrom({ center, range }: LightSource, point: Vector2): SightLevel {
  const distance = Math.hypot(point.x - center.x, point.y - center.y) - EDGE_TOLERANCE;
  if (distance <= range.bright) return 'seen';
  return distance <= range.bright + range.dim ? 'silhouette' : 'hidden';
}
