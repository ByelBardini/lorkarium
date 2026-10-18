import type { WallDto, WallShapeDto } from '@lorkarium/contracts';
import {
  wall,
  wallOutsideBox,
  wallSegments,
  wallWithoutSegment,
  type EraseBox,
  type Segment,
  type Wall,
} from '@lorkarium/game-core';

/** A confirmed wall as the game-core rules read it (sight, passage, segments).
 *
 *  Example: `blockedPassage(centers, board.walls.map(gameWallOf))` */
export function gameWallOf(dto: WallDto): Wall {
  return wall({
    kind: dto.kind,
    shape: dto.shape,
    x: dto.x,
    y: dto.y,
    width: dto.width,
    height: dto.height,
    points: 'points' in dto ? dto.points : null,
    doorState: dto.doorState,
  });
}

/** The straight pieces of a confirmed wall, in cells.
 *
 *  Example: `wallSegmentsOf(northWall()) // [{ from: { x: 2, y: 2 }, to: { x: 6, y: 2 } }]` */
export function wallSegmentsOf(dto: WallDto): Segment[] {
  return wallSegments(gameWallOf(dto));
}

/** The shape of a confirmed wall as a command sends it: no id nor door state (strict DTO).
 *
 *  Example: `deps.recordEdit([{ kind: 'wallsRemoved', walls: [{ id, shape: shapeOfWall(wall) }] }])` */
export function shapeOfWall(dto: WallDto): WallShapeDto {
  const { kind, x, y, width, height } = dto;
  if (!('points' in dto)) return { kind, shape: dto.shape, x, y, width, height };
  const points = dto.points.map(([px, py]): [number, number] => [px, py]);
  return { kind, shape: dto.shape, x, y, width, height, points };
}

/** The walls left once piece `segmentIndex` is erased (the game-core rule the server applies),
 *  as shapes to record on the undo stack: lines and freehands of the same kind.
 *
 *  Example: `wallRestOf(box, 0) // the three other sides, one freehand` */
export function wallRestOf(dto: WallDto, segmentIndex: number): WallShapeDto[] {
  return wallWithoutSegment(gameWallOf(dto), segmentIndex).map(shapeOfPiece);
}

/** What the eraser box does to the board (the game-core rule the server applies): the walls it
 *  touches and, in their order, the shapes left outside it.
 *
 *  Example: `wallAreaEraseOf(board.walls, { x: 3, y: 1, width: 2, height: 2 }).erased.length` */
export function wallAreaEraseOf(
  walls: readonly WallDto[],
  box: EraseBox,
): Readonly<{ erased: WallDto[]; rest: WallShapeDto[] }> {
  const erased: WallDto[] = [];
  const rest: WallShapeDto[] = [];
  for (const dto of walls) {
    const left = wallOutsideBox(gameWallOf(dto), box);
    if (!left) continue;
    erased.push(dto);
    rest.push(...left.map(shapeOfPiece));
  }
  return { erased, rest };
}

// What is left of an erase is always a path: a line or a freehand.
function shapeOfPiece(piece: Wall): WallShapeDto {
  const points = (piece.points ?? []).map(([px, py]): [number, number] => [px, py]);
  const { kind, x, y, width, height } = piece;
  const shape = piece.shape === 'line' ? 'line' : 'freehand';
  return { kind, shape, x, y, width, height, points };
}
