import type { WallDto, WallShapeDto } from '@lorkarium/contracts';
import { wall, type Wall } from '@lorkarium/game-core';
import type { WallPosition } from './wall-rules.bo';
import type { NewWallPo, WallMovePo, WallPo } from './walls.po';

type WallPoint = [number, number];

/** A saved wall as the rules of other modules read it: its id beside the game-core value. */
export type PlacedWall = Readonly<{ id: string; wall: Wall }>;

/** Wall row → the wall clients see; Postgres numeric "2.50" becomes 2.5. A row the game-core
 *  refuses is a broken table and throws citing the wall.
 *
 *  Example: `toWallDto(row).x // 2.5` */
export function toWallDto(row: WallPo): WallDto {
  const value = wallOfRow(row);
  const base = {
    id: row.id,
    kind: value.kind,
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
    doorState: value.doorState,
  };
  if (value.shape === 'rectangle' || value.shape === 'ellipse') {
    return { ...base, shape: value.shape };
  }
  return { ...base, shape: value.shape, points: (value.points ?? []).map(copyPoint) };
}

/** Wall row → the game-core wall the rules and sight work with.
 *
 *  Example: `wallOfRow(row).shape // 'line'` */
export function wallOfRow(row: WallPo): Wall {
  try {
    return wall({
      kind: row.kind,
      shape: row.shape,
      x: Number(row.x),
      y: Number(row.y),
      width: Number(row.width),
      height: Number(row.height),
      points: row.points,
      doorState: row.doorState,
    });
  } catch (cause) {
    throw new Error(`wall ${row.id} was saved broken: ${String(cause)}`, { cause });
  }
}

/** Wall row → its id and game-core value, for the passage of a token.
 *
 *  Example: `rules.requirePassage(tokenId, cells, size, rows.map(placedWallOf))` */
export function placedWallOf(row: WallPo): PlacedWall {
  return { id: row.id, wall: wallOfRow(row) };
}

/** The walls of a scene twice over: `placed` (with ids, to name the wall that blocks) and `walls`
 *  (the game-core array), each `placed[i].wall` being the very `walls[i]`. */
export type SceneWalls = Readonly<{ placed: readonly PlacedWall[]; walls: readonly Wall[] }>;

/** Wall rows of a scene → `SceneWalls`, built once so the `walls` array keeps its identity.
 *
 *  Example: `rules.requirePassage(tokenId, cells, size, sceneWallsOf(rows))` */
export function sceneWallsOf(rows: readonly WallPo[]): SceneWalls {
  const placed = rows.map(placedWallOf);
  return { placed, walls: placed.map(({ wall }) => wall) };
}

/** A shape as the master drew it → the game-core wall (a door is born closed).
 *
 *  Example: `rules.place(wallOfShape(shape))` */
export function wallOfShape(shape: WallShapeDto): Wall {
  return wall({
    kind: shape.kind,
    shape: shape.shape,
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
    points: 'points' in shape ? shape.points : null,
    doorState: shape.kind === 'door' ? 'closed' : null,
  });
}

/** A saved wall moved to `(x, y)`, for the scene rule.
 *
 *  Example: `rules.place(wallAt(wallOfRow(row), move))` */
export function wallAt(value: Wall, at: WallPosition): Wall {
  return wall({ ...value, x: at.x, y: at.y });
}

/** A shape as sent → the row to insert, to the hundredth; a door is born closed.
 *
 *  Example: `toNewWallPo(scene.id, command.walls[0])` */
export function toNewWallPo(sceneId: string, shape: WallShapeDto): NewWallPo {
  return {
    sceneId,
    kind: shape.kind,
    shape: shape.shape,
    x: numericOf(shape.x),
    y: numericOf(shape.y),
    width: numericOf(shape.width),
    height: numericOf(shape.height),
    points: 'points' in shape ? shape.points.map(roundedPoint) : null,
    doorState: shape.kind === 'door' ? 'closed' : null,
  };
}

/** A game-core wall (what an erase leaves) → the row to insert, to the hundredth.
 *
 *  Example: `rest.map((piece) => toNewWallPoOf(scene.id, piece))` */
export function toNewWallPoOf(sceneId: string, value: Wall): NewWallPo {
  return {
    sceneId,
    kind: value.kind,
    shape: value.shape,
    x: numericOf(value.x),
    y: numericOf(value.y),
    width: numericOf(value.width),
    height: numericOf(value.height),
    points: value.points ? value.points.map(([px, py]) => roundedPoint([px, py])) : null,
    doorState: value.doorState,
  };
}

/** The corner of a saved wall, in numbers. */
export function positionOfWall(row: WallPo): WallPosition {
  return { x: Number(row.x), y: Number(row.y) };
}

/** A move as sent → the numeric strings to save, to the hundredth.
 *
 *  Example: `toWallMovePo({ wallId, x: 7.125, y: 1 }) // { wallId, x: '7.13', y: '1.00' }` */
export function toWallMovePo(move: Readonly<{ wallId: string } & WallPosition>): WallMovePo {
  return { wallId: move.wallId, x: numericOf(move.x), y: numericOf(move.y) };
}

/** A coordinate rounded to the hundredth, as the table keeps it. */
export function wallHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}

function numericOf(value: number): string {
  return wallHundredth(value).toFixed(2);
}

function roundedPoint([x, y]: WallPoint): WallPoint {
  return [wallHundredth(x), wallHundredth(y)];
}

function copyPoint([x, y]: readonly [number, number]): WallPoint {
  return [x, y];
}
