import { coneAngle, coneOf, type Cone, type ConeAngle } from './cone.vo';
import { boxFits, drawingBox } from './drawing-box.vo';
import { facing, type Facing } from './facing.vo';
import type { SceneSize } from './grid';
import { REACH_MAX, assertReach } from './reach';

/** The longest bright or dim light, in cells (the same ceiling as sight). */
export const LIGHT_RANGE_MAX = REACH_MAX;

/** How far a light shines, in cells: fully up to `bright`, then `dim` more of half-light. */
export type LightRange = Readonly<{ bright: number; dim: number }>;

/** A light placed on the map (a wall torch, a campfire): a point in fractional cells, its range,
 *  whether it is lit, where it points (`facing`) and how wide it opens (`angle`; 360 = every side). */
export type SceneLight = Readonly<{
  x: number;
  y: number;
  range: LightRange;
  lit: boolean;
  facing: Facing;
  angle: ConeAngle;
}>;

/** Builds a light range, refusing a side that is not a finite number from 0 to 100 cells.
 *
 *  Example: `lightRange(4, 4)` → `{ bright: 4, dim: 4 }` (a torch: 6 m + 6 m at 1.5 m per cell) */
export function lightRange(bright: number, dim: number): LightRange {
  assertReach('Light', 'bright', bright);
  assertReach('Light', 'dim', dim);
  return Object.freeze({ bright, dim });
}

/** Builds a map light, refusing a coordinate that is not a finite number ≥ 0, a facing out of
 *  0–359 or an angle out of 1–360. Whether it lies inside the scene is `lightFits`, because the
 *  scene can shrink.
 *
 *  Example: `sceneLight({ x: 5.5, y: 3, range: lightRange(4, 4), lit: true, facing: 0, angle: 360 })` */
export function sceneLight(input: SceneLight): SceneLight {
  assertCoordinate('x', input.x);
  assertCoordinate('y', input.y);
  const { x, y, range, lit } = input;
  const direction = facing(input.facing);
  const angle = coneAngle('Light', input.angle);
  return Object.freeze({ x, y, range, lit, facing: direction, angle });
}

/** The cone a map light shines in, or `null` when it shines every side (360°).
 *
 *  Example: `lightConeOf(spotlightFacing90At60)` → `{ facing: 90, angle: 60 }` */
export function lightConeOf(light: SceneLight): Cone | null {
  return coneOf(light.facing, light.angle);
}

/** Whether the light's point lies inside the scene; the edge counts.
 *
 *  Example: `lightFits({ widthCells: 20, heightCells: 12 }, torchAt20x12)` → `true` */
export function lightFits(scene: SceneSize, light: SceneLight): boolean {
  return boxFits(scene, drawingBox(light.x, light.y, 0, 0));
}

function assertCoordinate(axis: 'x' | 'y', value: number): void {
  if (Number.isFinite(value) && value >= 0) return;
  throw new RangeError(`Light ${axis} ${String(value)} is invalid: expected a finite number ≥ 0.`);
}
