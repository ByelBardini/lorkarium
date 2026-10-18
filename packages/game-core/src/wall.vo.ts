import { drawingBox } from './drawing-box.vo';

/** What a wall restricts: `wall` sight and movement, `grate` only movement (glass, bars),
 *  `curtain` only sight (veil), `door` both while closed or locked. */
export type WallKind = 'wall' | 'grate' | 'curtain' | 'door';
export type WallShapeKind = 'line' | 'freehand' | 'rectangle' | 'ellipse';
export type DoorState = 'closed' | 'open' | 'locked';
/** A vertex relative to the wall box's top-left corner, in fractional cells. */
export type WallPoint = readonly [number, number];

/** A wall in fractional cells: the drawing's box, plus `points` on the line and the freehand
 *  (relative to `x, y`) and the `doorState` that only a door has. */
export type Wall = Readonly<{
  kind: WallKind;
  shape: WallShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  points: readonly WallPoint[] | null;
  doorState: DoorState | null;
}>;

// Points are stored to 0.01 cell; a vertex a rounding error past the box still lies on it.
const BOX_TOLERANCE = 1e-9;

/** Validates a wall (box, points for its shape, door only straight and with a state) and returns
 *  it frozen; a mismatch throws a `RangeError` citing the value and the expected shape.
 *
 *  Example: `wall({ kind: 'grate', shape: 'rectangle', x: 2, y: 2, width: 4, height: 3, points: null, doorState: null })` */
export function wall(input: Wall): Wall {
  drawingBox(input.x, input.y, input.width, input.height);
  assertDoor(input);
  if (input.shape === 'line' || input.shape === 'freehand') assertPoints(input);
  else assertArea(input);
  return Object.freeze({ ...input });
}

/** Whether the wall cuts sight: everything but a grate and an open door.
 *
 *  Example: `blocksSight(curtain)` → `true` */
export function blocksSight(value: Wall): boolean {
  if (value.kind === 'door') return value.doorState !== 'open';
  return value.kind !== 'grate';
}

/** Whether the wall bars a player's token: everything but a curtain and an open door.
 *
 *  Example: `blocksMovement(grate)` → `true` */
export function blocksMovement(value: Wall): boolean {
  if (value.kind === 'door') return value.doorState !== 'open';
  return value.kind !== 'curtain';
}

function assertDoor(input: Wall): void {
  if (input.kind !== 'door') {
    if (input.doorState === null) return;
    throw new RangeError(`Wall ${input.kind} has doorState ${input.doorState}; expected null.`);
  }
  if (input.doorState === null) {
    throw new RangeError('Wall door has doorState null; expected closed, open or locked.');
  }
  if (input.shape !== 'line') {
    throw new RangeError(`Wall door must be a line; got ${input.shape}.`);
  }
}

function assertPoints(input: Wall): void {
  const points = input.points ?? [];
  const expected = input.shape === 'line' ? points.length === 2 : points.length >= 2;
  if (!expected) {
    const shape = input.shape === 'line' ? '2' : 'at least 2';
    throw new RangeError(`Wall ${input.shape} has ${points.length} points; expected ${shape}.`);
  }
  for (const point of points) assertInsideBox(input, point);
}

function assertInsideBox(input: Wall, [px, py]: WallPoint): void {
  const inside =
    px >= -BOX_TOLERANCE &&
    py >= -BOX_TOLERANCE &&
    px <= input.width + BOX_TOLERANCE &&
    py <= input.height + BOX_TOLERANCE;
  if (inside) return;
  throw new RangeError(
    `Wall point (${px}, ${py}) is outside the ${input.width} × ${input.height} box: expected 0…width × 0…height.`,
  );
}

function assertArea(input: Wall): void {
  if (input.points !== null) {
    throw new RangeError(`Wall ${input.shape} has points: expected null.`);
  }
  for (const side of ['width', 'height'] as const) {
    if (input[side] > 0) continue;
    throw new RangeError(
      `Wall ${input.shape} ${side} ${input[side]} is invalid: expected more than 0.`,
    );
  }
}
