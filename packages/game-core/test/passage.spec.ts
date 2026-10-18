import { describe, expect, it } from 'vitest';
import { blockedPassage, legTouchesSegment, tokenCenter } from '../src/passage';
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

const VERTICAL_AT_2 = lineWall([2, 0], [2, 10]);

describe('blockedPassage', () => {
  it('a leg from (1.5, 5.5) to (4.5, 5.5) across the wall x = 2 is barred on leg 0 by wall 0', () => {
    const path = [
      { x: 1.5, y: 5.5 },
      { x: 4.5, y: 5.5 },
    ];
    expect(blockedPassage(path, [VERTICAL_AT_2])).toEqual({ legIndex: 0, wallIndex: 0 });
  });

  it('going around the end of the wall through a bend at (1.5, 10.5) passes', () => {
    const path = [
      { x: 1.5, y: 5.5 },
      { x: 1.5, y: 10.5 },
      { x: 4.5, y: 10.5 },
    ];
    expect(blockedPassage(path, [VERTICAL_AT_2])).toBeNull();
  });

  it('a gap between (0,5)–(5,5) and (6,5)–(10,5) lets the leg at x = 5.5 through', () => {
    const walls = [lineWall([0, 5], [5, 5]), lineWall([6, 5], [10, 5])];
    const path = [
      { x: 5.5, y: 4.5 },
      { x: 5.5, y: 5.5 },
    ];
    expect(blockedPassage(path, walls)).toBeNull();
  });

  it('a destination exactly on the wall line counts as crossing', () => {
    const path = [
      { x: 1.5, y: 5.5 },
      { x: 2, y: 5.5 },
    ];
    expect(blockedPassage(path, [VERTICAL_AT_2])).toEqual({ legIndex: 0, wallIndex: 0 });
  });

  it('a leg running collinear over the wall is barred', () => {
    const path = [
      { x: 2, y: 11 },
      { x: 2, y: 8 },
    ];
    expect(blockedPassage(path, [VERTICAL_AT_2])).toEqual({ legIndex: 0, wallIndex: 0 });
  });

  it('the end of a wall touching the middle of the leg is barred', () => {
    const stub = lineWall([3, 2], [3, 5]);
    const path = [
      { x: 1.5, y: 5 },
      { x: 4.5, y: 5 },
    ];
    expect(blockedPassage(path, [stub])).toEqual({ legIndex: 0, wallIndex: 0 });
  });

  it('a leg starting on the wall line and moving away is not barred (a token stuck on it can leave)', () => {
    const path = [
      { x: 2, y: 5.5 },
      { x: 3.5, y: 5.5 },
    ];
    expect(blockedPassage(path, [VERTICAL_AT_2])).toBeNull();
  });

  it.each([
    ['grate', null, { legIndex: 0, wallIndex: 0 }],
    ['curtain', null, null],
    ['door', 'open', null],
    ['door', 'closed', { legIndex: 0, wallIndex: 0 }],
    ['door', 'locked', { legIndex: 0, wallIndex: 0 }],
  ] as const)('a %s (%s) across the leg gives %o', (kind, doorState, expected) => {
    const crossing = lineWall([2, 0], [2, 10], kind, doorState);
    const path = [
      { x: 1.5, y: 5.5 },
      { x: 4.5, y: 5.5 },
    ];
    expect(blockedPassage(path, [crossing])).toEqual(expected);
  });

  it('the index is that of the first barred leg and wall (the second leg of three, the second wall)', () => {
    const walls = [lineWall([10, 0], [10, 1]), VERTICAL_AT_2];
    const path = [
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 5.5 },
      { x: 4.5, y: 5.5 },
      { x: 4.5, y: 0.5 },
    ];
    expect(blockedPassage(path, walls)).toEqual({ legIndex: 1, wallIndex: 1 });
  });

  it.each([
    ['a single point', [{ x: 1.5, y: 5.5 }], [VERTICAL_AT_2]],
    ['no point', [], [VERTICAL_AT_2]],
    [
      'no wall',
      [
        { x: 1.5, y: 5.5 },
        { x: 4.5, y: 5.5 },
      ],
      [],
    ],
  ])('%s is never barred', (_name, path, walls) => {
    expect(blockedPassage(path, walls)).toBeNull();
  });
});

describe('legTouchesSegment', () => {
  it('a segment met only at the start of the leg does not touch it', () => {
    const leg = { from: { x: 2, y: 5 }, to: { x: 4, y: 5 } };
    expect(legTouchesSegment(leg, { from: { x: 2, y: 0 }, to: { x: 2, y: 10 } })).toBe(false);
  });

  it('a parallel segment one hundredth away does not touch the leg', () => {
    const leg = { from: { x: 0, y: 5 }, to: { x: 4, y: 5 } };
    expect(legTouchesSegment(leg, { from: { x: 0, y: 5.01 }, to: { x: 4, y: 5.01 } })).toBe(false);
  });
});

describe('tokenCenter', () => {
  it('a 2 × 1 token at (3, 4) is centered at (4, 4.5)', () => {
    expect(tokenCenter({ col: 3, row: 4 }, { width: 2, height: 1 })).toEqual({ x: 4, y: 4.5 });
  });
});
