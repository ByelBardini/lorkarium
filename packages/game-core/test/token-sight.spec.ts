import { describe, expect, it } from 'vitest';
import {
  doorSeenBy,
  eyeOf,
  sightLevel,
  sightRange,
  type Eye,
  type SightContext,
  type SightMode,
} from '../src/token-sight';
import { wall, type DoorState, type Wall, type WallKind } from '../src/wall.vo';

function lineWall(
  from: [number, number],
  to: [number, number],
  kind: WallKind = 'wall',
  doorState: DoorState | null = null,
): Wall {
  const x = Math.min(from[0], to[0]);
  const y = Math.min(from[1], to[1]);
  return wall({
    kind,
    shape: 'line',
    x,
    y,
    width: Math.abs(to[0] - from[0]),
    height: Math.abs(to[1] - from[1]),
    points: [
      [from[0] - x, from[1] - y],
      [to[0] - x, to[1] - y],
    ],
    doorState,
  });
}

const TORCH_EYE: Eye = { center: { x: 5.5, y: 5.5 }, range: sightRange(3, 3) };

function context(walls: Wall[] = [], mode: SightMode = 'dark', eyes = [TORCH_EYE]): SightContext {
  return { eyes, walls, mode };
}

function tokenAt(col: number, row: number, scenery = false, side = 1) {
  return { box: { x: col, y: row, width: side, height: side }, scenery };
}

describe('sightRange', () => {
  it('a bright 12 and dim 4 is kept as sent', () => {
    expect(sightRange(12, 4)).toEqual({ bright: 12, dim: 4 });
  });

  it.each([
    [101, 'bright 101'],
    [-1, 'bright -1'],
    [Number.NaN, 'bright NaN'],
    [Number.POSITIVE_INFINITY, 'bright Infinity'],
  ])('a bright of %s is refused citing the value and 0 to 100 cells', (value, shown) => {
    expect(() => sightRange(value, 0)).toThrow(new RegExp(`${shown}.*0 to 100 cells`));
  });

  it('a dim of 101 is refused citing the dim', () => {
    expect(() => sightRange(0, 101)).toThrow(/dim 101.*0 to 100 cells/);
  });
});

describe('sightLevel in the dark', () => {
  it.each([
    ['at 2 (inside bright)', 7, 'seen'],
    ['at 5 (inside dim)', 10, 'silhouette'],
    ['at 8 (past dim)', 13, 'hidden'],
  ] as const)('a 1 × 1 token %s is %s', (_name, col, level) => {
    expect(sightLevel(context(), tokenAt(col, 5))).toBe(level);
  });

  it('a token at 2 behind a wall is hidden', () => {
    expect(sightLevel(context([lineWall([6.8, 0], [6.8, 12])]), tokenAt(7, 5))).toBe('hidden');
  });

  it('a token at 2 behind a grate is seen', () => {
    const grate = lineWall([6.8, 0], [6.8, 12], 'grate');
    expect(sightLevel(context([grate]), tokenAt(7, 5))).toBe('seen');
  });

  it('a scenery token inside dim is seen whole, as part of the map', () => {
    expect(sightLevel(context(), tokenAt(10, 5, true))).toBe('seen');
  });

  it('a scenery token past dim is hidden', () => {
    expect(sightLevel(context(), tokenAt(13, 5, true))).toBe('hidden');
  });

  it('with bright 0 and dim 3, a token at 2 is a silhouette', () => {
    const dimOnly = { center: TORCH_EYE.center, range: sightRange(0, 3) };
    expect(sightLevel(context([], 'dark', [dimOnly]), tokenAt(7, 5))).toBe('silhouette');
  });

  it('a 3 × 3 token whose center is behind a corner is seen by an inset corner in view', () => {
    const corner = [lineWall([8, 2], [8, 6.5])];
    const wide = { center: TORCH_EYE.center, range: sightRange(10, 0) };
    expect(sightLevel(context(corner, 'dark', [wide]), tokenAt(8.2, 5.5, false, 3))).toBe('seen');
  });

  it('with two eyes, the one that sees wins', () => {
    const far = { center: { x: 30, y: 30 }, range: sightRange(1, 0) };
    expect(sightLevel(context([], 'dark', [far, TORCH_EYE]), tokenAt(7, 5))).toBe('seen');
  });

  it('without eyes, every token is hidden', () => {
    expect(sightLevel(context([], 'dark', []), tokenAt(7, 5))).toBe('hidden');
  });
});

describe('sightLevel by daylight and off', () => {
  it('by daylight a token 15 cells away in an empty room is seen', () => {
    expect(sightLevel(context([], 'daylight'), tokenAt(20, 5))).toBe('seen');
  });

  it('by daylight a token behind a wall is hidden', () => {
    const between = lineWall([12, 0], [12, 12]);
    expect(sightLevel(context([between], 'daylight'), tokenAt(20, 5))).toBe('hidden');
  });

  it('by daylight an eye without a range still sees', () => {
    const plain = { center: TORCH_EYE.center, range: null };
    expect(sightLevel(context([], 'daylight', [plain]), tokenAt(20, 5))).toBe('seen');
  });

  it('with vision off every token is seen, even without eyes and behind a wall', () => {
    const between = lineWall([6.8, 0], [6.8, 12]);
    expect(sightLevel(context([between], 'off', []), tokenAt(7, 5))).toBe('seen');
  });
});

describe('doorSeenBy', () => {
  const roomWall = lineWall([7, 0], [7, 5]);
  const roomDoor = lineWall([7, 5], [7, 6], 'door', 'closed');
  const nextDoor = lineWall([10, 5], [10, 6], 'door', 'closed');

  it('the door in the wall of the room, at 2, is seen, though closed it blocks sight', () => {
    expect(doorSeenBy(context([roomWall, roomDoor]), roomDoor)).toBe(true);
  });

  it('the door of the next room, behind another wall, is not seen', () => {
    const walls = [roomWall, roomDoor, lineWall([8, 0], [8, 12]), nextDoor];
    expect(doorSeenBy(context(walls), nextDoor)).toBe(false);
  });

  it('a door past bright + dim is not seen', () => {
    const farDoor = lineWall([14, 5], [14, 6], 'door', 'closed');
    expect(doorSeenBy(context([farDoor]), farDoor)).toBe(false);
  });

  it('by daylight a door 30 cells away with nothing between is seen', () => {
    const farDoor = lineWall([35.5, 5], [35.5, 6], 'door', 'closed');
    expect(doorSeenBy(context([farDoor], 'daylight'), farDoor)).toBe(true);
  });

  it('with vision off any door is seen', () => {
    const walls = [lineWall([8, 0], [8, 12]), nextDoor];
    expect(doorSeenBy(context(walls, 'off', []), nextDoor)).toBe(true);
  });
});

describe('eyeOf', () => {
  it('a token without sight has no eye in the dark', () => {
    expect(eyeOf({ x: 1, y: 1 }, null, 'dark')).toBeNull();
  });

  it('a token without sight still sees by daylight', () => {
    expect(eyeOf({ x: 1, y: 1 }, null, 'daylight')).toEqual({
      center: { x: 1, y: 1 },
      range: null,
    });
  });

  it('a token with sight is an eye with its range', () => {
    expect(eyeOf({ x: 1, y: 1 }, sightRange(2, 1), 'dark')).toEqual({
      center: { x: 1, y: 1 },
      range: { bright: 2, dim: 1 },
    });
  });
});
