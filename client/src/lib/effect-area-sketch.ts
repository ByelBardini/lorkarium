import {
  EFFECT_AREA_REACH_MAX,
  effectArea,
  facingToward,
  reachToward,
  snapFacing,
  turnEffectArea,
  type EffectArea,
  type Vector2,
} from '@lorkarium/game-core';
import type { EffectAreaStyle } from './effect-area-style';

/** The box a token covers, in cells: where an emanation is born. */
export type AreaFootprint = Readonly<{ x: number; y: number; width: number; height: number }>;

/** A press of the area tool and where the pointer is now, in fractional cells; `snap` is Shift. */
export type EffectAreaSketchInput = Readonly<{
  style: EffectAreaStyle;
  press: Vector2;
  pointer: Vector2;
  snap: boolean;
  /** The tokens under which an emanation may be born, in drawing order (the last on top). */
  footprints: readonly AreaFootprint[];
}>;

// Under half a cell the drag is a click, not an area.
const MIN_DRAG = 0.5;
const SHIFT_STEP = 45;

/** The area a press-and-drag of the area tool makes: each shape is born where the game-core
 *  rule wants it (grid shapes on an intersection, a cell side, a corner or a cell center; the
 *  emanation around the token pressed; smooth ones free, Shift snapping to half a cell) and
 *  reaches the pointer. `null`: a drag under half a cell, or an emanation pressed off a token.
 *
 *  Example: `effectAreaSketchOf({ style, press: { x: 5.2, y: 4.9 }, pointer: { x: 8.1, y: 5 }, snap: false, footprints })` */
export function effectAreaSketchOf(input: EffectAreaSketchInput): EffectArea | null {
  const { press, pointer } = input;
  if (Math.hypot(pointer.x - press.x, pointer.y - press.y) < MIN_DRAG) return null;
  if (input.style.kind === 'square') return squareOf(input);
  const born = bornAreaOf(input);
  if (!born) return null;
  const aimed = 'facing' in born ? turnEffectArea(born, angleOf(born, input)) : born;
  const step = input.snap ? 0.5 : 0;
  return effectArea({ ...aimed, reach: reachToward(aimed, pointer, step) } as EffectArea);
}

// Each shape with reach 1, where it is born; the drag then aims it and stretches it.
function bornAreaOf(input: EffectAreaSketchInput): EffectArea | null {
  const { style, press } = input;
  const color = style.color;
  const corner = { x: Math.round(press.x), y: Math.round(press.y) };
  const center = { x: Math.floor(press.x) + 0.5, y: Math.floor(press.y) + 0.5 };
  switch (style.kind) {
    case 'circle':
      return { kind: 'circle', ...corner, reach: 1, color };
    case 'semicircle':
      return { kind: 'semicircle', ...corner, reach: 1, facing: 0, color };
    case 'orthogonal_cone':
      return {
        kind: 'orthogonal_cone',
        x: center.x + 0.5,
        y: center.y,
        reach: 1,
        facing: 0,
        color,
      };
    case 'diagonal_cone':
      return {
        kind: 'diagonal_cone',
        x: center.x + 0.5,
        y: center.y + 0.5,
        reach: 1,
        facing: 45,
        color,
      };
    case 'line':
      return { kind: 'line', ...center, reach: 1, facing: 0, color };
    case 'emanation':
      return emanationOf(input);
    default:
      return smoothOf(input);
  }
}

function smoothOf({ style, press, snap }: EffectAreaSketchInput): EffectArea {
  const origin = snap
    ? { x: toHalf(press.x), y: toHalf(press.y) }
    : { x: toHundredth(press.x), y: toHundredth(press.y) };
  if (style.kind === 'smooth_semicircle') {
    return { kind: 'smooth_semicircle', ...origin, reach: 0.5, facing: 0, color: style.color };
  }
  return { kind: 'smooth_circle', ...origin, reach: 0.5, color: style.color };
}

function emanationOf({ style, press, footprints }: EffectAreaSketchInput): EffectArea | null {
  const under = footprints.findLast(
    (box) =>
      press.x >= box.x &&
      press.x < box.x + box.width &&
      press.y >= box.y &&
      press.y < box.y + box.height,
  );
  if (!under) return null;
  return { kind: 'emanation', ...under, reach: 1, color: style.color };
}

// Cones aim from the center of the cell they leave; the others from their origin.
function angleOf(
  area: EffectArea & { facing: number },
  { pointer, snap }: EffectAreaSketchInput,
): number {
  const cone = area.kind === 'orthogonal_cone' || area.kind === 'diagonal_cone';
  const from = cone ? sourceCenterOf(area) : area;
  const toward = facingToward(from, pointer) ?? area.facing;
  const free = area.kind === 'line' || area.kind === 'smooth_semicircle';
  return free && snap ? snapFacing(toward, SHIFT_STEP) : toward;
}

// Born facing 0 (or 45), the cone's origin is half a cell out of the center of the cell pressed.
function sourceCenterOf(area: EffectArea & { facing: number }): Vector2 {
  const out = area.kind === 'diagonal_cone' ? { x: 0.5, y: 0.5 } : { x: 0.5, y: 0 };
  return { x: area.x - out.x, y: area.y - out.y };
}

function squareOf({ style, press, pointer }: EffectAreaSketchInput): EffectArea {
  const from = { x: Math.round(press.x), y: Math.round(press.y) };
  const to = { x: Math.round(pointer.x), y: Math.round(pointer.y) };
  const side = Math.min(
    Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y), 1),
    EFFECT_AREA_REACH_MAX,
  );
  const x = to.x < from.x ? from.x - side : from.x;
  const y = to.y < from.y ? from.y - side : from.y;
  return effectArea({
    kind: 'square',
    x: Math.max(x, 0),
    y: Math.max(y, 0),
    width: side,
    height: side,
    color: style.color,
  });
}

function toHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function toHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}
