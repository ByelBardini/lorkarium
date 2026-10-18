import { describe, expect, it } from 'vitest';
import {
  distanceFromAreaOrigin,
  effectAreaBounds,
  effectAreaCells,
  effectAreaContains,
  type GridCell,
} from '../src/effect-area-cells';
import { effectArea, type EffectArea } from '../src/effect-area.vo';

const SCENE_20_BY_12 = { widthCells: 20, heightCells: 12 };

function cellsOf(area: EffectArea): GridCell[] {
  return effectAreaCells(SCENE_20_BY_12, effectArea(area));
}

function block(cols: [number, number], rows: [number, number]): GridCell[] {
  const cells: GridCell[] = [];
  for (let row = rows[0]; row <= rows[1]; row += 1) {
    for (let col = cols[0]; col <= cols[1]; col += 1) cells.push({ col, row });
  }
  return cells;
}

function without(cells: GridCell[], removed: GridCell[]): GridCell[] {
  return cells.filter((cell) => !removed.some((r) => r.col === cell.col && r.row === cell.row));
}

const at = (col: number, row: number): GridCell => ({ col, row });

describe('effectAreaCells — round shapes', () => {
  it('a circle of reach 1 on (5, 5) paints the four cells around the intersection', () => {
    expect(cellsOf({ kind: 'circle', x: 5, y: 5, reach: 1, color: 'ember' })).toEqual(
      block([4, 5], [4, 5]),
    );
  });

  it('a circle of reach 2 paints the 4×4 block without its four corners (12 cells)', () => {
    const corners = [at(3, 3), at(6, 3), at(3, 6), at(6, 6)];
    expect(cellsOf({ kind: 'circle', x: 5, y: 5, reach: 2, color: 'ember' })).toEqual(
      without(block([3, 6], [3, 6]), corners),
    );
  });

  it('a semicircle of reach 2 facing right paints only the cells on its right side', () => {
    expect(
      cellsOf({ kind: 'semicircle', x: 5, y: 5, reach: 2, facing: 0, color: 'ember' }),
    ).toEqual([at(5, 3), at(5, 4), at(6, 4), at(5, 5), at(6, 5), at(5, 6)]);
  });
});

describe('effectAreaCells — cones and the line', () => {
  it('an orthogonal cone of reach 3 facing right paints 1, 3 and 3 cells per column', () => {
    expect(
      cellsOf({ kind: 'orthogonal_cone', x: 5, y: 5.5, reach: 3, facing: 0, color: 'ember' }),
    ).toEqual([at(6, 4), at(7, 4), at(5, 5), at(6, 5), at(7, 5), at(6, 6), at(7, 6)]);
  });

  it('a diagonal cone of reach 2 facing 45 paints the corner cell and its two neighbors', () => {
    expect(
      cellsOf({ kind: 'diagonal_cone', x: 5, y: 5, reach: 2, facing: 45, color: 'ember' }),
    ).toEqual([at(5, 5), at(6, 5), at(5, 6)]);
  });

  it('a diagonal cone of reach 3 facing 45 paints 8 cells', () => {
    expect(
      cellsOf({ kind: 'diagonal_cone', x: 5, y: 5, reach: 3, facing: 45, color: 'ember' }),
    ).toEqual([at(5, 5), at(6, 5), at(7, 5), at(5, 6), at(6, 6), at(7, 6), at(5, 7), at(6, 7)]);
  });

  it('a line of reach 3 facing right paints the three cells ahead, never the one it leaves', () => {
    expect(cellsOf({ kind: 'line', x: 2.5, y: 2.5, reach: 3, facing: 0, color: 'ember' })).toEqual([
      at(3, 2),
      at(4, 2),
      at(5, 2),
    ]);
  });

  it('a line of reach 3 facing 45 paints the two diagonal cells within its reach', () => {
    expect(cellsOf({ kind: 'line', x: 2.5, y: 2.5, reach: 3, facing: 45, color: 'ember' })).toEqual(
      [at(3, 3), at(4, 4)],
    );
  });
});

describe('effectAreaCells — square and emanation', () => {
  it('a 3×2 square on (2, 3) paints the six cells inside its box', () => {
    expect(cellsOf({ kind: 'square', x: 2, y: 3, width: 3, height: 2, color: 'ember' })).toEqual(
      block([2, 4], [3, 4]),
    );
  });

  it('an emanation of reach 1 around a 1×1 token paints the 3×3 block around it', () => {
    expect(
      cellsOf({ kind: 'emanation', x: 5, y: 5, width: 1, height: 1, reach: 1, color: 'ember' }),
    ).toEqual(block([4, 6], [4, 6]));
  });

  it('an emanation of reach 2 paints the 5×5 block without its corners (21 cells)', () => {
    const corners = [at(3, 3), at(7, 3), at(3, 7), at(7, 7)];
    expect(
      cellsOf({ kind: 'emanation', x: 5, y: 5, width: 1, height: 1, reach: 2, color: 'ember' }),
    ).toEqual(without(block([3, 7], [3, 7]), corners));
  });

  it('a cell center exactly on the edge counts: a token on a half cell reaches 8 cells', () => {
    expect(
      cellsOf({ kind: 'emanation', x: 5.5, y: 5, width: 1, height: 1, reach: 1, color: 'ember' }),
    ).toEqual([at(5, 4), at(6, 4), at(4, 5), at(5, 5), at(6, 5), at(7, 5), at(5, 6), at(6, 6)]);
  });
});

describe('effectAreaCells — clipping, smooth shapes and determinism', () => {
  it('a circle on the scene corner paints only the cells inside the scene', () => {
    expect(cellsOf({ kind: 'circle', x: 0, y: 0, reach: 2, color: 'ember' })).toEqual([
      at(0, 0),
      at(1, 0),
      at(0, 1),
    ]);
  });

  it('a square spilling past the bottom right corner is clipped to the scene', () => {
    expect(cellsOf({ kind: 'square', x: 18, y: 10, width: 4, height: 4, color: 'ember' })).toEqual(
      block([18, 19], [10, 11]),
    );
  });

  it.each<[string, EffectArea]>([
    ['smooth circle', { kind: 'smooth_circle', x: 5.23, y: 4.87, reach: 2.27, color: 'ember' }],
    [
      'smooth semicircle',
      { kind: 'smooth_semicircle', x: 5, y: 5, reach: 3, facing: 33, color: 'ember' },
    ],
  ])('a %s paints no cell: it is a free outline', (_kind, area) => {
    expect(cellsOf(area)).toEqual([]);
  });

  it('the same area gives the same list in reading order every time (client and server agree)', () => {
    const cone: EffectArea = {
      kind: 'diagonal_cone',
      x: 5,
      y: 5,
      reach: 3,
      facing: 225,
      color: 'ember',
    };
    const first = cellsOf(cone);
    const sorted = [...first].sort((a, b) => a.row - b.row || a.col - b.col);
    expect(first).toEqual(sorted);
    expect(cellsOf(cone)).toEqual(first);
  });
});

describe('effectAreaContains and effectAreaBounds', () => {
  it('a point inside a smooth circle is contained and one just outside is not', () => {
    const circle = effectArea({ kind: 'smooth_circle', x: 5, y: 5, reach: 2, color: 'ember' });
    expect(effectAreaContains(circle, { x: 6.9, y: 5 })).toBe(true);
    expect(effectAreaContains(circle, { x: 7.1, y: 5 })).toBe(false);
  });

  it('a smooth semicircle facing down does not contain the point above its diameter', () => {
    const half = effectArea({
      kind: 'smooth_semicircle',
      x: 5,
      y: 5,
      reach: 2,
      facing: 90,
      color: 'ember',
    });
    expect(effectAreaContains(half, { x: 5, y: 6 })).toBe(true);
    expect(effectAreaContains(half, { x: 5, y: 4 })).toBe(false);
  });

  it('the bounds of a circle of reach 2 on (5, 5) go from (3, 3) to (7, 7)', () => {
    const circle = effectArea({ kind: 'circle', x: 5, y: 5, reach: 2, color: 'ember' });
    expect(effectAreaBounds(circle)).toEqual({ x: 3, y: 3, width: 4, height: 4 });
  });

  // Regression (2026-10-18): the selection of a cone was the whole circle of its reach.
  it('the bounds of a cone are its painted cells, not the circle of its reach', () => {
    const cone = effectArea({
      kind: 'orthogonal_cone',
      x: 5.5,
      y: 2,
      reach: 4,
      facing: 90,
      color: 'ember',
    });
    expect(effectAreaBounds(cone)).toEqual({ x: 3, y: 2, width: 5, height: 4 });
  });

  it('the bounds of a line hug the cells it paints', () => {
    const line = effectArea({ kind: 'line', x: 2.5, y: 2.5, reach: 3, facing: 0, color: 'ember' });
    expect(effectAreaBounds(line)).toEqual({ x: 3, y: 2, width: 3, height: 1 });
  });

  it('the bounds of a smooth semicircle facing down are only its lower half', () => {
    const half = effectArea({
      kind: 'smooth_semicircle',
      x: 5,
      y: 5,
      reach: 2,
      facing: 90,
      color: 'ember',
    });
    expect(effectAreaBounds(half)).toEqual({ x: 3, y: 5, width: 4, height: 2 });
  });

  it('the bounds of an emanation are its footprint grown by the reach on every side', () => {
    const aura = effectArea({
      kind: 'emanation',
      x: 5,
      y: 4,
      width: 2,
      height: 1,
      reach: 2,
      color: 'ember',
    });
    expect(effectAreaBounds(aura)).toEqual({ x: 3, y: 2, width: 6, height: 5 });
  });
});

describe('distanceFromAreaOrigin', () => {
  it('a circle measures from its center', () => {
    const round = effectArea({ kind: 'circle', x: 5, y: 5, reach: 2, color: 'ember' });
    expect(distanceFromAreaOrigin(round, { x: 8, y: 9 })).toBe(5);
  });

  it('an emanation measures from the nearest edge of the footprint, and 0 inside it', () => {
    const aura = effectArea({
      kind: 'emanation',
      x: 5,
      y: 5,
      width: 1,
      height: 1,
      reach: 1,
      color: 'ember',
    });
    expect(distanceFromAreaOrigin(aura, { x: 8, y: 5.5 })).toBe(2);
    expect(distanceFromAreaOrigin(aura, { x: 5.4, y: 5.6 })).toBe(0);
  });
});
