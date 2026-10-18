import {
  boxFits,
  drawingBox,
  wallOutsideBox,
  wallSegments,
  wallWithoutSegment,
  type EraseBox,
  type DoorState,
  type SceneSize,
  type Wall,
  type WallKind,
} from '@lorkarium/game-core';
import { StaleUndoError } from '../board/board.error';
import {
  InvalidDoorError,
  WallLimitError,
  WallOutOfSceneError,
  WallSegmentNotFoundError,
} from './walls.error';

export type WallLimits = Readonly<{
  /** `WALLS_PER_SCENE_MAX` and `WALL_SEGMENTS_PER_SCENE_MAX`, passed in: the BO does not read the contract. */
  walls: number;
  segments: number;
}>;

export type WallRulesState = Readonly<{ scene: SceneSize; limits: WallLimits }>;

export type WallPosition = Readonly<{ x: number; y: number }>;
export type WallKindChange = Readonly<{ kind: WallKind; doorState: DoorState | null }>;
/** A stored wall with its id, as the eraser reads the scene. */
export type IdentifiedWall = Readonly<{ id: string; wall: Wall }>;
/** What the eraser box does to a scene: the walls it touched and, in their order, what is left. */
export type AreaErase = Readonly<{ wallIds: string[]; rest: Wall[] }>;

/** The rules of a wall on its scene: its box fits the scene, the scene keeps at most so many walls
 *  and segments (the fog's cost), an undo finds the wall as it left it, and only a line is a door.
 *
 *  Example: `new WallRulesBo({ scene, limits: { walls: 500, segments: 4000 } }).place(northWall)` */
export class WallRulesBo {
  constructor(private readonly state: WallRulesState) {}

  place(value: Wall): Wall {
    const box = drawingBox(value.x, value.y, value.width, value.height);
    if (boxFits(this.state.scene, box)) return value;
    throw new WallOutOfSceneError(box, this.state.scene);
  }

  admit(stored: readonly Wall[], adding: readonly Wall[]): void {
    const all = [...stored, ...adding];
    const { walls, segments } = this.state.limits;
    if (all.length > walls) throw new WallLimitError('walls', all.length, walls);
    const segmentCount = all.reduce((total, value) => total + wallSegments(value).length, 0);
    if (segmentCount > segments) throw new WallLimitError('wall segments', segmentCount, segments);
  }

  /** No `expected` (a normal command) always passes; positions compare to the hundredth. */
  requireAt(wallId: string, expected: WallPosition | undefined, actual: WallPosition): void {
    if (!expected || samePosition(expected, actual)) return;
    throw new StaleUndoError(`wall ${wallId}`, shown(expected), shown(actual));
  }

  requireKind(wallId: string, expected: WallKind | undefined, actual: WallKind): void {
    if (!expected || expected === actual) return;
    throw new StaleUndoError(`wall ${wallId}`, expected, actual);
  }

  /** What is left once the straight piece `segmentIndex` is taken out of the wall (the game-core
   *  rule the client shares); a piece it does not have → `WALL_SEGMENT_NOT_FOUND`.
   *
   *  Example: `rules.restAfterErase(row.id, wallOfRow(row), 0)` */
  restAfterErase(wallId: string, value: Wall, segmentIndex: number): Wall[] {
    const count = wallSegments(value).length;
    if (segmentIndex >= count) throw new WallSegmentNotFoundError(wallId, segmentIndex, count);
    return wallWithoutSegment(value, segmentIndex);
  }

  /** The eraser box over the scene's walls (the game-core rule the client shares): each wall it
   *  covers is cut at its edges; the ones it does not touch are not named.
   *
   *  Example: `rules.eraseArea(rows.map(placedWallOf), { x: 3, y: 1, width: 2, height: 2 })` */
  eraseArea(stored: readonly IdentifiedWall[], box: EraseBox): AreaErase {
    const wallIds: string[] = [];
    const rest: Wall[] = [];
    for (const { id, wall } of stored) {
      const left = wallOutsideBox(wall, box);
      if (!left) continue;
      wallIds.push(id);
      rest.push(...left);
    }
    return { wallIds, rest };
  }

  /** The kind and door state a wall takes: a new door starts closed, a door keeps its state,
   *  anything else has none. A shape that is not a line never becomes a door. */
  kindChange(wallId: string, value: Wall, kind: WallKind): WallKindChange {
    if (kind !== 'door') return { kind, doorState: null };
    if (value.shape !== 'line') {
      throw new InvalidDoorError(wallId, `is a ${value.shape}; a door must be a line`);
    }
    return { kind, doorState: value.doorState ?? 'closed' };
  }
}

function samePosition(left: WallPosition, right: WallPosition): boolean {
  return hundredths(left.x) === hundredths(right.x) && hundredths(left.y) === hundredths(right.y);
}

function hundredths(value: number): number {
  return Math.round(value * 100);
}

function shown({ x, y }: WallPosition): string {
  return `(${x}, ${y})`;
}
