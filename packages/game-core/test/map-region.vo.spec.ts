import { describe, expect, it } from 'vitest';
import {
  MAP_NAME_MAX_LENGTH,
  MAP_POLYGON_VERTICES_MAX,
  MAP_POLYGON_VERTICES_MIN,
  MAP_REGION_DESCRIPTION_MAX_LENGTH,
  MAP_REGION_NAME_MAX_LENGTH,
  MAP_REGIONS_MAX,
  mapRegionGeometry,
  polygonArea,
  regionFocusPoint,
  regionsPaintOrder,
  type MapPoint,
  type MapRegionGeometry,
} from '../src/map-region.vo';

const TRIANGLE: MapPoint[] = [
  { x: 0.5, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

function squareOf(corner: number, side: number): MapPoint[] {
  return [
    { x: corner, y: corner },
    { x: corner + side, y: corner },
    { x: corner + side, y: corner + side },
    { x: corner, y: corner + side },
  ];
}

function circleOf(vertices: number): MapPoint[] {
  return Array.from({ length: vertices }, (_, index) => {
    const angle = (index / vertices) * 2 * Math.PI;
    return { x: 0.5 + 0.4 * Math.cos(angle), y: 0.5 + 0.4 * Math.sin(angle) };
  });
}

function polygon(points: MapPoint[]): MapRegionGeometry {
  return { shape: 'polygon', points };
}

function pin(x: number, y: number): MapRegionGeometry {
  return { shape: 'pin', point: { x, y } };
}

function idsOf(regions: readonly { id: string }[]): string[] {
  return regions.map((region) => region.id);
}

describe('map limits', () => {
  it('match the ones repeated by the contracts package', () => {
    expect([MAP_NAME_MAX_LENGTH, MAP_REGION_NAME_MAX_LENGTH]).toEqual([60, 60]);
    expect(MAP_REGION_DESCRIPTION_MAX_LENGTH).toBe(500);
    expect(MAP_REGIONS_MAX).toBe(300);
    expect([MAP_POLYGON_VERTICES_MIN, MAP_POLYGON_VERTICES_MAX]).toEqual([3, 128]);
  });
});

describe('mapRegionGeometry', () => {
  it('keeps a triangle inside the map point for point', () => {
    expect(mapRegionGeometry(polygon(TRIANGLE))).toEqual({
      shape: 'polygon',
      points: [
        { x: 0.5, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
    });
  });

  it('keeps a pin in the middle of the map', () => {
    expect(mapRegionGeometry(pin(0.5, 0.5))).toEqual({
      shape: 'pin',
      point: { x: 0.5, y: 0.5 },
    });
  });

  it.each([[3], [128]])('accepts a polygon with %i vertices', (vertices) => {
    const accepted = mapRegionGeometry(polygon(circleOf(vertices)));
    expect(accepted.shape === 'polygon' && accepted.points.length).toBe(vertices);
  });

  it('accepts points exactly on the edges of the map', () => {
    const wholeMap = squareOf(0, 1);
    expect(mapRegionGeometry(polygon(wholeMap))).toEqual({ shape: 'polygon', points: wholeMap });
    expect(mapRegionGeometry(pin(1, 0))).toEqual({ shape: 'pin', point: { x: 1, y: 0 } });
  });

  it('returns a frozen copy, so nobody edits a validated geometry in place', () => {
    const points = squareOf(0, 0.5);
    const accepted = mapRegionGeometry(polygon(points));
    expect(accepted.shape === 'polygon' && accepted.points).not.toBe(points);
    expect(Object.isFrozen(accepted)).toBe(true);
    expect(accepted.shape === 'polygon' && Object.isFrozen(accepted.points)).toBe(true);
    expect(accepted.shape === 'polygon' && Object.isFrozen(accepted.points[0])).toBe(true);
  });

  it('freezes the point of a pin too', () => {
    const accepted = mapRegionGeometry(pin(0.2, 0.3));
    expect(accepted.shape === 'pin' && Object.isFrozen(accepted.point)).toBe(true);
  });

  it.each([[2], [129]])('refuses a polygon with %i vertices, citing the count', (vertices) => {
    const points = vertices === 2 ? TRIANGLE.slice(0, 2) : circleOf(vertices);
    expect(() => mapRegionGeometry(polygon(points))).toThrow(
      new RangeError(`Map polygon has ${vertices} vertices: expected 3 to 128.`),
    );
  });

  it.each([
    [1.01, 0.5, '1.01, 0.5'],
    [-0.01, 0.5, '-0.01, 0.5'],
    [0.5, 1.5, '0.5, 1.5'],
    [Number.NaN, 0.5, 'NaN, 0.5'],
    [0.5, Number.POSITIVE_INFINITY, '0.5, Infinity'],
  ])('refuses a pin at (%s, %s), citing the point', (x, y, cited) => {
    expect(() => mapRegionGeometry(pin(x, y))).toThrow(
      new RangeError(`Map point (${cited}) is invalid: expected x and y from 0 to 1.`),
    );
  });

  it('refuses a polygon with one vertex out of the map, citing the vertex', () => {
    const points = [...TRIANGLE.slice(0, 2), { x: 1.01, y: 0 }];
    expect(() => mapRegionGeometry(polygon(points))).toThrow(
      new RangeError('Map point (1.01, 0) is invalid: expected x and y from 0 to 1.'),
    );
  });

  it('refuses three collinear points, citing the zero area', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 1 },
    ];
    expect(() => mapRegionGeometry(polygon(points))).toThrow(
      new RangeError('Map polygon has area 0: expected more than 1e-12 (not all on one line).'),
    );
  });

  // These decimals are not exact in binary: the cross products add up to about 1.4e-17, not 0.
  it('refuses collinear points whose area is only rounding noise', () => {
    const points = [
      { x: 0.1, y: 0.7 },
      { x: 0.2, y: 0.4 },
      { x: 0.3, y: 0.1 },
    ];
    expect(() => mapRegionGeometry(polygon(points))).toThrow(/e-17: expected more than 1e-12/);
  });

  it('accepts the smallest region a user can draw on the largest map, one pixel', () => {
    const onePixel = squareOf(0.5, 1 / 8192);
    expect(mapRegionGeometry(polygon(onePixel))).toEqual({ shape: 'polygon', points: onePixel });
  });
});

describe('polygonArea', () => {
  it('measures a square of side 0.5 as 0.25', () => {
    expect(polygonArea(squareOf(0.25, 0.5))).toBeCloseTo(0.25, 12);
  });

  it('is the same clockwise and counterclockwise', () => {
    const reversed = squareOf(0.25, 0.5).reverse();
    expect(polygonArea(reversed)).toBeCloseTo(0.25, 12);
  });

  it('measures a triangle by its own shape, not by its bounding box', () => {
    expect(polygonArea(TRIANGLE)).toBeCloseTo(0.5, 12);
  });
});

describe('regionFocusPoint', () => {
  it('is the center of a square', () => {
    const focus = regionFocusPoint(polygon(squareOf(0.25, 0.5)));
    expect(focus.x).toBeCloseTo(0.5, 12);
    expect(focus.y).toBeCloseTo(0.5, 12);
  });

  it('is the point of a pin', () => {
    expect(regionFocusPoint(pin(0.2, 0.7))).toEqual({ x: 0.2, y: 0.7 });
  });

  // The average of these six vertices would be (0.2, 0.2).
  it('weighs an L by its area, not by how many vertices each arm has', () => {
    const focus = regionFocusPoint(
      polygon([
        { x: 0, y: 0 },
        { x: 0.4, y: 0 },
        { x: 0.4, y: 0.2 },
        { x: 0.2, y: 0.2 },
        { x: 0.2, y: 0.4 },
        { x: 0, y: 0.4 },
      ]),
    );
    expect(focus.x).toBeCloseTo(1 / 6, 12);
    expect(focus.y).toBeCloseTo(1 / 6, 12);
  });

  it('does not depend on the direction the polygon was drawn', () => {
    const focus = regionFocusPoint(polygon(squareOf(0.1, 0.2).reverse()));
    expect(focus.x).toBeCloseTo(0.2, 12);
    expect(focus.y).toBeCloseTo(0.2, 12);
  });
});

describe('regionsPaintOrder', () => {
  const kingdom = { id: 'kingdom', geometry: polygon(squareOf(0, 0.8)) };
  const city = { id: 'city', geometry: polygon(squareOf(0.1, 0.2)) };
  const inn = { id: 'inn', geometry: pin(0.15, 0.15) };

  it('paints the biggest polygon first, so the smaller one stays clickable on top', () => {
    expect(idsOf(regionsPaintOrder([city, kingdom]))).toEqual(['kingdom', 'city']);
  });

  it('paints a pin last, even listed before every polygon', () => {
    expect(idsOf(regionsPaintOrder([inn, city, kingdom]))).toEqual(['kingdom', 'city', 'inn']);
  });

  it('breaks a tie between polygons of the same area by id', () => {
    const north = { id: 'north', geometry: polygon(squareOf(0, 0.25)) };
    const east = { id: 'east', geometry: polygon(squareOf(0, 0.25)) };
    expect(idsOf(regionsPaintOrder([north, east]))).toEqual(['east', 'north']);
  });

  it('breaks a tie between pins by id', () => {
    const tavern = { id: 'tavern', geometry: pin(0.9, 0.9) };
    expect(idsOf(regionsPaintOrder([tavern, inn]))).toEqual(['inn', 'tavern']);
  });

  it('compares ids by code unit, so no browser locale changes the order', () => {
    const lower = { id: 'a', geometry: pin(0.1, 0.1) };
    const upper = { id: 'B', geometry: pin(0.2, 0.2) };
    expect(idsOf(regionsPaintOrder([lower, upper]))).toEqual(['B', 'a']);
  });

  it('gives the same order whatever the order received', () => {
    const shuffled = idsOf(regionsPaintOrder([city, inn, kingdom]));
    expect(shuffled).toEqual(idsOf(regionsPaintOrder([inn, kingdom, city])));
    expect(shuffled).toEqual(['kingdom', 'city', 'inn']);
  });

  it('keeps every other field of the region and leaves the list received alone', () => {
    const named = { ...city, name: 'Valdris' };
    const received = [named, kingdom];
    expect(regionsPaintOrder(received)[1]).toBe(named);
    expect(idsOf(received)).toEqual(['city', 'kingdom']);
  });
});
