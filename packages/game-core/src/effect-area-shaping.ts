import {
  EFFECT_AREA_REACH_MAX,
  SMOOTH_REACH_MIN,
  effectArea,
  isSmoothArea,
  type AimedArea,
  type EffectArea,
} from './effect-area.vo';
import { distanceFromAreaOrigin } from './effect-area-cells';
import { normalizeFacing, snapFacing, type Vector2 } from './facing';

// Where the cone origin sits from the center of the cell it leaves, per facing (half a cell out).
const SIDE_OFFSETS: Readonly<Record<number, Vector2>> = {
  0: { x: 0.5, y: 0 },
  90: { x: 0, y: 0.5 },
  180: { x: -0.5, y: 0 },
  270: { x: 0, y: -0.5 },
};
const CORNER_OFFSETS: Readonly<Record<number, Vector2>> = {
  45: { x: 0.5, y: 0.5 },
  135: { x: -0.5, y: 0.5 },
  225: { x: -0.5, y: -0.5 },
  315: { x: 0.5, y: -0.5 },
};

/** The reach that takes the shape's edge to `point`: grid shapes in whole cells, smooth ones to
 *  the hundredth (or to `step`, e.g. 0.5 with Shift), within the shape's minimum and 100 cells.
 *  An emanation measures from its footprint.
 *
 *  Example: `reachToward(circleAt(5, 5), { x: 8.2, y: 5 }, 1)` → `3` */
export function reachToward(area: EffectArea, point: Vector2, step: number): number {
  const distance = distanceFromAreaOrigin(area, point);
  const smooth = isSmoothArea(area);
  const snapStep = smooth ? step : 1;
  const snapped = snapStep > 0 ? Math.round(distance / snapStep) * snapStep : distance;
  const least = smooth ? SMOOTH_REACH_MIN : 1;
  return toHundredth(Math.min(Math.max(snapped, least), EFFECT_AREA_REACH_MAX));
}

/** The area pointed at `wanted` degrees: grid cones and semicircles snap to their own facings
 *  (cones pivot on the center of the cell they leave), the line and the smooth semicircle turn
 *  freely, and shapes without a facing come back unchanged.
 *
 *  Example: `turnEffectArea(sideConeAt(5, 5.5, 0), 90)` → origin `(4.5, 6)`, facing 90 */
export function turnEffectArea(area: EffectArea, wanted: number): EffectArea {
  if (!('facing' in area)) return area;
  if (area.kind === 'orthogonal_cone') return pivoted(area, snapFacing(wanted, 90), SIDE_OFFSETS);
  if (area.kind === 'diagonal_cone') {
    return pivoted(area, normalizeFacing(snapFacing(wanted - 45, 90) + 45), CORNER_OFFSETS);
  }
  const turned = area.kind === 'semicircle' ? snapFacing(wanted, 90) : normalizeFacing(wanted);
  return effectArea({ ...area, facing: turned });
}

/** The area moved by a delta in cells: grid shapes by whole cells (their origin stays where the
 *  shape is born), smooth ones by the exact delta to the hundredth. Moving the origin before the
 *  scene's top-left throws the `effectArea` `RangeError`.
 *
 *  Example: `shiftEffectArea(sideConeAt(5, 5.5, 0), 1.4, -0.6)` → origin `(6, 4.5)` */
export function shiftEffectArea(area: EffectArea, dx: number, dy: number): EffectArea {
  const smooth = isSmoothArea(area);
  const stepX = smooth ? dx : Math.round(dx);
  const stepY = smooth ? dy : Math.round(dy);
  return effectArea({ ...area, x: toHundredth(area.x + stepX), y: toHundredth(area.y + stepY) });
}

function pivoted(
  area: AimedArea,
  facing: number,
  offsets: Readonly<Record<number, Vector2>>,
): EffectArea {
  const from = offsets[area.facing];
  const to = offsets[facing];
  if (!from || !to) return area;
  const x = area.x - from.x + to.x;
  const y = area.y - from.y + to.y;
  return effectArea({ ...area, x, y, facing });
}

function toHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}
