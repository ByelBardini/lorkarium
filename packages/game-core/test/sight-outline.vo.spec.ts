import { describe, expect, it } from 'vitest';
import {
  SIGHT_OUTLINE_ISLANDS_MAX,
  SIGHT_OUTLINE_POINTS_MAX,
  sightOutline,
  type SightOutlinePoint,
} from '../src/sight-outline.vo';

function polygonOf(points: number): SightOutlinePoint[] {
  return Array.from({ length: points }, (_, index) => [index / points, 0.5] as const);
}

describe('sightOutline', () => {
  it('keeps a valid triangle point for point', () => {
    const triangle: SightOutlinePoint[] = [
      [0.5, 0],
      [1, 1],
      [0, 1],
    ];
    expect(sightOutline([triangle])).toEqual([
      [
        [0.5, 0],
        [1, 1],
        [0, 1],
      ],
    ]);
  });

  it('accepts no polygon at all, the outline of a fully transparent image', () => {
    expect(sightOutline([])).toEqual([]);
  });

  it('returns the outline frozen, down to its points', () => {
    const outline = sightOutline([polygonOf(3)]);
    expect(Object.isFrozen(outline)).toBe(true);
    expect(Object.isFrozen(outline[0])).toBe(true);
    expect(Object.isFrozen(outline[0]?.[0])).toBe(true);
  });

  it('fixes the ceilings at 48 points and 4 islands', () => {
    expect(SIGHT_OUTLINE_POINTS_MAX).toBe(48);
    expect(SIGHT_OUTLINE_ISLANDS_MAX).toBe(4);
  });

  it('accepts a point exactly on each side of the unit cell', () => {
    const edges: SightOutlinePoint[] = [
      [0, 0],
      [1, 0],
      [1, 1],
    ];
    expect(sightOutline([edges])[0]?.[2]).toEqual([1, 1]);
  });

  it('accepts exactly 48 points spread over exactly 4 islands', () => {
    const islands = [polygonOf(12), polygonOf(12), polygonOf(12), polygonOf(12)];
    expect(sightOutline(islands)).toHaveLength(4);
  });

  it.each([
    ['x above 1', [1.5, 0.2], '1.5'],
    ['y above 1', [0.2, 1.01], '1.01'],
    ['x below 0', [-0.1, 0.2], '-0.1'],
    ['y below 0', [0.2, -0.3], '-0.3'],
    ['y not a number', [0.2, Number.NaN], 'NaN'],
    ['x infinite', [Number.POSITIVE_INFINITY, 0.2], 'Infinity'],
  ] as const)('a point with %s is refused citing the value and 0 to 1', (_, point, cited) => {
    const refused = () => sightOutline([[[0, 0], [1, 1], point]]);
    expect(refused).toThrow(RangeError);
    expect(refused).toThrow(cited);
    expect(refused).toThrow('0 to 1');
  });

  it('a polygon of 2 points is refused citing the count and the minimum', () => {
    const refused = () => sightOutline([polygonOf(2)]);
    expect(refused).toThrow(RangeError);
    expect(refused).toThrow('2 points: expected at least 3');
  });

  it('49 points in all, even split between islands, are refused citing the total', () => {
    const refused = () => sightOutline([polygonOf(25), polygonOf(24)]);
    expect(refused).toThrow(RangeError);
    expect(refused).toThrow('49 points: expected at most 48');
  });

  it('5 islands are refused citing the count', () => {
    const refused = () => sightOutline(Array.from({ length: 5 }, () => polygonOf(3)));
    expect(refused).toThrow(RangeError);
    expect(refused).toThrow('5 polygons: expected at most 4');
  });
});
