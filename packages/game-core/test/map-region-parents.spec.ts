import { describe, expect, it } from 'vitest';
import { mapRegionParents, type MapPoint, type MapRegionGeometry } from '../src/map-region.vo';

function square(corner: number, side: number): MapRegionGeometry {
  const points: MapPoint[] = [
    { x: corner, y: corner },
    { x: corner + side, y: corner },
    { x: corner + side, y: corner + side },
    { x: corner, y: corner + side },
  ];
  return { shape: 'polygon', points };
}

function pinAt(x: number, y: number): MapRegionGeometry {
  return { shape: 'pin', point: { x, y } };
}

function parentsOf(regions: Record<string, MapRegionGeometry>): Record<string, string> {
  const list = Object.entries(regions).map(([id, geometry]) => ({ id, geometry }));
  return Object.fromEntries(mapRegionParents(list));
}

describe('mapRegionParents', () => {
  it('puts a polygon inside the polygon around it', () => {
    expect(parentsOf({ reino: square(0.1, 0.8), cidade: square(0.4, 0.1) })).toEqual({
      cidade: 'reino',
    });
  });

  it('puts a pin inside the polygon around it', () => {
    expect(parentsOf({ reino: square(0.1, 0.8), taverna: pinAt(0.5, 0.5) })).toEqual({
      taverna: 'reino',
    });
  });

  it('picks the smallest polygon around it, so levels nest one by one', () => {
    expect(
      parentsOf({
        mundo: square(0, 1),
        reino: square(0.1, 0.8),
        cidade: square(0.4, 0.2),
        taverna: pinAt(0.5, 0.5),
      }),
    ).toEqual({ reino: 'mundo', cidade: 'reino', taverna: 'cidade' });
  });

  it('leaves out a polygon that only overlaps another', () => {
    expect(parentsOf({ a: square(0.1, 0.4), b: square(0.3, 0.4) })).toEqual({});
  });

  it('leaves out a pin outside every polygon', () => {
    expect(parentsOf({ reino: square(0.1, 0.2), porto: pinAt(0.9, 0.9) })).toEqual({});
  });

  it('never makes two equal polygons parents of each other', () => {
    expect(parentsOf({ a: square(0.2, 0.3), b: square(0.2, 0.3) })).toEqual({});
  });

  it('a pin is nobody’s parent', () => {
    expect(parentsOf({ a: pinAt(0.5, 0.5), b: pinAt(0.5, 0.5) })).toEqual({});
  });
});
