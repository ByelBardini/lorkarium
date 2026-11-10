import { describe, expect, it } from 'vitest';
import { cell, type Cell } from '../src/cell.vo';
import { patrolCycle, patrolFits, patrolPoseAt } from '../src/token-patrol';
import type { PatrolRepeat, TokenPatrol } from '../src/token-patrol.vo';
import { tokenSize } from '../src/token-size.vo';

const SQUARE: readonly Cell[] = [cell(0, 0), cell(2, 0), cell(2, 2), cell(0, 2)];
const CORRIDOR: readonly Cell[] = [cell(0, 0), cell(3, 0)];
const SCENE_20_BY_12 = { widthCells: 20, heightCells: 12 };

function patrolOf(
  path: readonly Cell[],
  options: { repeat?: PatrolRepeat; speed?: number; turns?: boolean } = {},
): TokenPatrol {
  const { repeat = 'loop', speed = 1, turns = true } = options;
  return { path, repeat, speed, turns, gait: 'glide' };
}

function squareAt(elapsedMs: number, speed = 1): ReturnType<typeof patrolPoseAt> {
  return patrolPoseAt({
    patrol: patrolOf(SQUARE, { speed }),
    step: 0,
    origin: cell(0, 0),
    elapsedMs,
  });
}

function cellsOf(cycle: readonly Cell[]): string {
  return cycle.map((point) => `(${String(point.col)},${String(point.row)})`).join(' ');
}

describe('patrolCycle', () => {
  it('a square loop walks every cell and comes back without repeating the first', () => {
    expect(cellsOf(patrolCycle(patrolOf(SQUARE)))).toBe(
      '(0,0) (1,0) (2,0) (2,1) (2,2) (1,2) (0,2) (0,1)',
    );
  });

  it('a corridor going back and forth does not repeat either end', () => {
    expect(cellsOf(patrolCycle(patrolOf(CORRIDOR, { repeat: 'bounce' })))).toBe(
      '(0,0) (1,0) (2,0) (3,0) (2,0) (1,0)',
    );
  });

  it('a half-cell corridor steps like pathCells and returns over the same cells', () => {
    const halfCell = patrolOf([cell(0, 0), cell(1.5, 0)], { repeat: 'bounce' });
    expect(cellsOf(patrolCycle(halfCell))).toBe('(0,0) (1,0) (1.5,0) (1,0)');
  });
});

describe('patrolPoseAt', () => {
  it('2500 ms into a square at 1 cell per second stands on (2,0) facing right', () => {
    expect(squareAt(2500)).toEqual({
      cell: { col: 2, row: 0 },
      facing: 0,
      step: 2,
      nextStepInMs: 500,
    });
  });

  it('8000 ms into the square closes the lap on (0,0) facing up', () => {
    expect(squareAt(8000)).toMatchObject({ cell: { col: 0, row: 0 }, facing: 270, step: 0 });
  });

  it('at 2 cells per second the square reaches (2,0) in 1000 ms', () => {
    expect(squareAt(1000, 2).cell).toEqual({ col: 2, row: 0 });
  });

  it('a token away from the route walks back to it first, with no cycle step yet', () => {
    const pose = patrolPoseAt({
      patrol: patrolOf(SQUARE),
      step: 0,
      origin: cell(5, 5),
      elapsedMs: 3000,
    });
    expect(pose).toMatchObject({ cell: { col: 2, row: 2 }, facing: 225, step: null });
  });

  it('after walking back the token enters the cycle at its step and goes on', () => {
    const pose = patrolPoseAt({
      patrol: patrolOf(SQUARE),
      step: 0,
      origin: cell(5, 5),
      elapsedMs: 6000,
    });
    expect(pose).toMatchObject({ cell: { col: 1, row: 0 }, step: 1 });
  });

  it.each([
    [0, 2, 1],
    [1000, 2, 2],
  ])('resuming from step 3 on its cell, %s ms stands on (%s,%s)', (elapsedMs, col, row) => {
    const pose = patrolPoseAt({ patrol: patrolOf(SQUARE), step: 3, origin: cell(2, 1), elapsedMs });
    expect(pose.cell).toEqual({ col, row });
  });

  it('4000 ms into a bounce corridor walks back to (2,0) facing left', () => {
    const patrol = patrolOf(CORRIDOR, { repeat: 'bounce' });
    const pose = patrolPoseAt({ patrol, step: 0, origin: cell(0, 0), elapsedMs: 4000 });
    expect(pose).toMatchObject({ cell: { col: 2, row: 0 }, facing: 180 });
  });

  it.each([0, 2500, 8000])('without turning the facing is null at %s ms', (elapsedMs) => {
    const patrol = patrolOf(SQUARE, { turns: false });
    expect(patrolPoseAt({ patrol, step: 0, origin: cell(0, 0), elapsedMs }).facing).toBeNull();
  });

  it('a negative elapsed time (clock ahead) is the pose of instant 0', () => {
    expect(squareAt(-300)).toEqual({
      cell: { col: 0, row: 0 },
      facing: 0,
      step: 0,
      nextStepInMs: 1000,
    });
  });

  it('a step past the end of the cycle is refused citing it and the cycle length', () => {
    const outOfRange = (): unknown =>
      patrolPoseAt({ patrol: patrolOf(SQUARE), step: 8, origin: cell(0, 0), elapsedMs: 0 });
    expect(outOfRange).toThrow(
      new RangeError('Patrol step 8 is out of range: the cycle has 8 cells.'),
    );
  });
});

describe('patrolFits', () => {
  it('a 2 × 2 token on (19,0) of a 20 × 12 scene is the point that does not fit', () => {
    const route = [cell(0, 0), cell(19, 0), cell(19, 5)];
    expect(patrolFits(SCENE_20_BY_12, route, tokenSize(2, 2))).toEqual({ col: 19, row: 0 });
  });

  it('a route with every point inside the scene fits', () => {
    expect(patrolFits(SCENE_20_BY_12, SQUARE, tokenSize(2, 2))).toBeNull();
  });

  it('a 2 × 2 token touching the edge at (18,10) fits', () => {
    expect(patrolFits(SCENE_20_BY_12, [cell(0, 0), cell(18, 10)], tokenSize(2, 2))).toBeNull();
  });
});
