import { describe, expect, it } from 'vitest';
import { blocksMovement, blocksSight, wall, type Wall } from '../src/wall.vo';

type WallInput = Parameters<typeof wall>[0];

const NORTH_LINE: WallInput = {
  kind: 'wall',
  shape: 'line',
  x: 2,
  y: 2,
  width: 4,
  height: 0,
  points: [
    [0, 0],
    [4, 0],
  ],
  doorState: null,
};

function shaped(overrides: Partial<WallInput>): WallInput {
  return { ...NORTH_LINE, ...overrides } as WallInput;
}

describe('wall', () => {
  it('a straight wall keeps its box and points, frozen', () => {
    const value = wall(NORTH_LINE);
    expect(value).toEqual({
      kind: 'wall',
      shape: 'line',
      x: 2,
      y: 2,
      width: 4,
      height: 0,
      points: [
        [0, 0],
        [4, 0],
      ],
      doorState: null,
    });
    expect(Object.isFrozen(value)).toBe(true);
  });

  it.each([
    ['rectangle at (2, 2) 4 × 3', shaped({ shape: 'rectangle', height: 3, points: null })],
    ['ellipse at (0, 0) 4 × 2', shaped({ shape: 'ellipse', x: 0, y: 0, height: 2, points: null })],
    [
      'freehand of 3 points',
      shaped({
        shape: 'freehand',
        width: 2,
        height: 1,
        points: [
          [0, 0],
          [1, 1],
          [2, 0],
        ],
      }),
    ],
    ['closed straight door', shaped({ kind: 'door', doorState: 'closed' })],
  ])('a %s is accepted as sent', (_name, input) => {
    expect(wall(input)).toEqual(input);
  });

  it('a line with 3 points is refused citing the count and the 2 expected', () => {
    const input = shaped({
      points: [
        [0, 0],
        [2, 0],
        [4, 0],
      ],
    });
    expect(() => wall(input)).toThrow(/line has 3 points; expected 2/);
  });

  it('a freehand wall with a single point is refused citing the count', () => {
    const input = shaped({ shape: 'freehand', points: [[0, 0]] });
    expect(() => wall(input)).toThrow(/freehand has 1 points; expected at least 2/);
  });

  it('a point at (5, 0) outside the 4 × 0 box is refused citing the point and the box', () => {
    const input = shaped({
      points: [
        [0, 0],
        [5, 0],
      ],
    });
    expect(() => wall(input)).toThrow(/point \(5, 0\) is outside the 4 × 0 box/);
  });

  it('a rectangle of width 0 is refused citing the side', () => {
    const input = shaped({ shape: 'rectangle', width: 0, height: 3, points: null });
    expect(() => wall(input)).toThrow(/rectangle width 0 is invalid: expected more than 0/);
  });

  it.each([
    ['x', -1, /x -1.*número finito ≥ 0/],
    ['x', Number.NaN, /x NaN.*número finito ≥ 0/],
  ])('a box %s of %s is refused by the drawing box rule', (_axis, value, message) => {
    expect(() => wall(shaped({ x: value }))).toThrow(message);
  });

  it('a rectangular door is refused because a door must be a line', () => {
    const input = shaped({
      kind: 'door',
      shape: 'rectangle',
      height: 3,
      points: null,
      doorState: 'closed',
    });
    expect(() => wall(input)).toThrow(/door must be a line; got rectangle/);
  });

  it('a door without a state is refused citing the null state', () => {
    expect(() => wall(shaped({ kind: 'door', doorState: null }))).toThrow(
      /door has doorState null; expected closed, open or locked/,
    );
  });

  it('a plain wall carrying a door state is refused citing the state', () => {
    expect(() => wall(shaped({ doorState: 'open' }))).toThrow(
      /wall has doorState open; expected null/,
    );
  });
});

describe('blocksSight and blocksMovement', () => {
  it.each([
    ['wall', null, true, true],
    ['grate', null, false, true],
    ['curtain', null, true, false],
    ['door', 'closed', true, true],
    ['door', 'locked', true, true],
    ['door', 'open', false, false],
  ] as const)('a %s (%s) blocks sight %s and movement %s', (kind, doorState, sight, movement) => {
    const value: Wall = wall(shaped({ kind, doorState }));
    expect(blocksSight(value)).toBe(sight);
    expect(blocksMovement(value)).toBe(movement);
  });
});
