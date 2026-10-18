import { effectArea } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { cellEdgesOf, smoothOutlineOf } from '@/lib/effect-area-outline';

describe('cellEdgesOf', () => {
  it('a 2×2 block has only its 8 outer sides, none of the inner ones', () => {
    const block = [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 1 },
    ];
    const edges = cellEdgesOf(block);
    expect(edges).toHaveLength(8);
    expect(edges).not.toContainEqual({ from: { x: 1, y: 0 }, to: { x: 1, y: 1 } });
  });

  it('an L of 3 cells has 8 outer sides', () => {
    const corner = [
      { col: 0, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 1 },
    ];
    expect(cellEdgesOf(corner)).toHaveLength(8);
  });

  it('no cell has no outline', () => {
    expect(cellEdgesOf([])).toEqual([]);
  });
});

describe('smoothOutlineOf', () => {
  it('a smooth semicircle facing down starts and ends on its diameter, at its reach', () => {
    const half = effectArea({
      kind: 'smooth_semicircle',
      x: 5,
      y: 5,
      reach: 2,
      facing: 90,
      color: 'gold',
    });
    const points = smoothOutlineOf(half);
    const first = points[0];
    const last = points.at(-1);
    expect(first?.x).toBeCloseTo(7, 6);
    expect(first?.y).toBeCloseTo(5, 6);
    expect(last?.x).toBeCloseTo(3, 6);
    expect(last?.y).toBeCloseTo(5, 6);
    for (const point of points) expect(Math.hypot(point.x - 5, point.y - 5)).toBeCloseTo(2, 6);
    expect(points.every((point) => point.y >= 5 - 1e-9)).toBe(true);
  });

  it('a smooth circle goes all around its center at its reach', () => {
    const circle = effectArea({ kind: 'smooth_circle', x: 3, y: 4, reach: 1.5, color: 'gold' });
    const points = smoothOutlineOf(circle);
    expect(points.length).toBeGreaterThan(16);
    for (const point of points) expect(Math.hypot(point.x - 3, point.y - 4)).toBeCloseTo(1.5, 6);
    expect(points.some((point) => point.y < 4)).toBe(true);
    expect(points.some((point) => point.y > 4)).toBe(true);
  });
});
