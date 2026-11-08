import { describe, expect, it } from 'vitest';
import { cell, type Cell } from '../src/cell.vo';
import {
  PATROL_POINTS_MAX,
  PATROL_SPEED_MAX,
  PATROL_SPEED_MIN,
  tokenPatrol,
  type TokenPatrol,
} from '../src/token-patrol.vo';

const SQUARE: readonly Cell[] = [cell(0, 0), cell(2, 0), cell(2, 2), cell(0, 2)];

function patrolOf(path: readonly Cell[], speed = 1): TokenPatrol {
  return { path, repeat: 'loop', speed, turns: true };
}

function straightPath(points: number): Cell[] {
  return Array.from({ length: points }, (_, index) => cell(index, 0));
}

describe('tokenPatrol', () => {
  it('a square loop at 1 cell per second keeps every field', () => {
    expect(tokenPatrol(patrolOf(SQUARE))).toEqual({
      path: [
        { col: 0, row: 0 },
        { col: 2, row: 0 },
        { col: 2, row: 2 },
        { col: 0, row: 2 },
      ],
      repeat: 'loop',
      speed: 1,
      turns: true,
    });
  });

  it('a built patrol and its path are frozen', () => {
    const built = tokenPatrol(patrolOf([...SQUARE]));
    expect([Object.isFrozen(built), Object.isFrozen(built.path)]).toEqual([true, true]);
  });

  it('a path of 32 points is accepted', () => {
    expect(tokenPatrol(patrolOf(straightPath(PATROL_POINTS_MAX))).path).toHaveLength(32);
  });

  it.each([PATROL_SPEED_MIN, PATROL_SPEED_MAX])('the speed limit %s is accepted', (speed) => {
    expect(tokenPatrol(patrolOf(SQUARE, speed)).speed).toBe(speed);
  });

  it.each([1, 33])('a path of %s points is refused citing the count and 2 to 32', (points) => {
    expect(() => tokenPatrol(patrolOf(straightPath(points)))).toThrow(
      new RangeError(`Patrol path has ${String(points)} points; expected 2 to 32.`),
    );
  });

  it.each([
    [0.3, '0.3'],
    [4.25, '4.25'],
    [Number.NaN, 'NaN'],
  ])('a speed of %s is refused citing it and the 0.25 steps from 0.25 to 4', (speed, shown) => {
    expect(() => tokenPatrol(patrolOf(SQUARE, speed))).toThrow(
      new RangeError(`Patrol speed ${shown} is invalid: expected 0.25 to 4 in steps of 0.25.`),
    );
  });

  it('a path that never leaves its first cell is refused citing its points', () => {
    expect(() => tokenPatrol(patrolOf([cell(1, 1), cell(1, 1)]))).toThrow(
      new RangeError(
        'Patrol path (1, 1) → (1, 1) does not move: expected at least 2 cells in the cycle.',
      ),
    );
  });

  it('a point off the half-cell steps is refused with the cell error', () => {
    const offStep: Cell = { col: 1.25, row: 0 };
    expect(() => tokenPatrol(patrolOf([cell(0, 0), offStep]))).toThrow(
      new RangeError('Cell col 1.25 is invalid: expected a multiple of 0.5 ≥ 0.'),
    );
  });
});
