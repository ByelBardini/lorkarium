import { describe, expect, it } from 'vitest';
import { coneOf, type Cone } from '../src/cone.vo';
import { insidePolygon, lineOfSight, sightArea } from '../src/sight-area';
import { distanceToBox, insideCone, type ViewField } from '../src/view-field';
import { wall, type DoorState, type Wall, type WallKind } from '../src/wall.vo';

const SCENE = { widthCells: 20, heightCells: 12 };

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

describe('sightArea in an empty room', () => {
  const eye = { x: 10.5, y: 6.5 };
  const area = sightArea(eye, [], SCENE, 3);

  it('a point at 1.5 is inside and one at 3.5 is outside a reach of 3', () => {
    expect(insidePolygon({ x: 12, y: 6.5 }, area)).toBe(true);
    expect(insidePolygon({ x: 14, y: 6.5 }, area)).toBe(false);
  });

  it.each([0, 45, 90, 135, 180, 225, 270, 315])(
    'the point at 2.95 toward %s° is inside',
    (degrees) => {
      const radians = (degrees * Math.PI) / 180;
      const point = { x: eye.x + 2.95 * Math.cos(radians), y: eye.y + 2.95 * Math.sin(radians) };
      expect(insidePolygon(point, area)).toBe(true);
    },
  );

  it('no vertex lies farther than the reach', () => {
    const farthest = Math.max(...area.map((v) => Math.hypot(v.x - eye.x, v.y - eye.y)));
    expect(farthest).toBeLessThanOrEqual(3 + 1e-9);
  });
});

describe('sightArea cut by walls', () => {
  it('a wall at x = 12 hides what lies past it within reach 5', () => {
    const area = sightArea({ x: 10.5, y: 6.5 }, [lineWall([12, 0], [12, 12])], SCENE, 5);
    expect(insidePolygon({ x: 11.5, y: 6.5 }, area)).toBe(true);
    expect(insidePolygon({ x: 12.5, y: 6.5 }, area)).toBe(false);
    expect(insidePolygon({ x: 13, y: 6.5 }, area)).toBe(false);
  });

  it('behind an L corner (14, 9) is hidden and (11, 9) beside it is seen', () => {
    const corner = [lineWall([12, 2], [12, 8]), lineWall([12, 8], [16, 8])];
    const area = sightArea({ x: 10, y: 5 }, corner, SCENE, 8);
    expect(insidePolygon({ x: 14, y: 9 }, area)).toBe(false);
    expect(insidePolygon({ x: 11, y: 9 }, area)).toBe(true);
  });

  it.each([
    ['grate', null, true],
    ['door', 'open', true],
    ['curtain', null, false],
    ['door', 'closed', false],
  ] as const)('a %s (%s) between leaves the far side seen: %s', (kind, doorState, seen) => {
    const between = lineWall([12, 0], [12, 12], kind, doorState);
    const area = sightArea({ x: 10.5, y: 6.5 }, [between], SCENE, 5);
    expect(insidePolygon({ x: 13, y: 6.5 }, area)).toBe(seen);
  });

  it('crossing walls are cut at their crossing, not only at their ends', () => {
    const cross = [lineWall([12, 3], [12, 10]), lineWall([11, 6], [15, 6])];
    const area = sightArea({ x: 10, y: 4.3 }, cross, SCENE, 10);
    expect(insidePolygon({ x: 11.95, y: 5.98 }, area)).toBe(true);
    expect(insidePolygon({ x: 12.5, y: 5.5 }, area)).toBe(false);
  });
});

describe('sightArea and the scene', () => {
  it('an eye at (1, 1) with reach 5 keeps every vertex inside the 20 × 12 scene', () => {
    const area = sightArea({ x: 1, y: 1 }, [], SCENE, 5);
    for (const vertex of area) {
      expect(vertex.x).toBeGreaterThanOrEqual(0);
      expect(vertex.y).toBeGreaterThanOrEqual(0);
      expect(vertex.x).toBeLessThanOrEqual(20);
      expect(vertex.y).toBeLessThanOrEqual(12);
    }
  });

  it('an unlimited reach is bounded by the scene, and (19.9, 11.9) is seen in an empty room', () => {
    const area = sightArea({ x: 10.5, y: 6.5 }, [], SCENE, Number.POSITIVE_INFINITY);
    expect(insidePolygon({ x: 19.9, y: 11.9 }, area)).toBe(true);
    expect(Math.max(...area.map((v) => v.x))).toBeLessThanOrEqual(20);
  });

  it('the same eye and walls give the same polygon in the same order', () => {
    const walls = [lineWall([12, 2], [12, 8]), lineWall([12, 8], [16, 8])];
    expect(sightArea({ x: 10, y: 5 }, walls, SCENE, 8)).toEqual(
      sightArea({ x: 10, y: 5 }, [...walls], SCENE, 8),
    );
  });
});

describe('lineOfSight', () => {
  it('a wall between the two points blocks the line', () => {
    expect(lineOfSight({ x: 1, y: 5 }, { x: 4, y: 5 }, [lineWall([2, 0], [2, 10])])).toBe(false);
  });

  it('a grate between the two points does not block the line', () => {
    const grate = lineWall([2, 0], [2, 10], 'grate');
    expect(lineOfSight({ x: 1, y: 5 }, { x: 4, y: 5 }, [grate])).toBe(true);
  });

  it('an eye exactly on a wall line sees both sides', () => {
    const line = lineWall([2, 0], [2, 10]);
    expect(lineOfSight({ x: 2, y: 5 }, { x: 4, y: 5 }, [line])).toBe(true);
    expect(lineOfSight({ x: 2, y: 5 }, { x: 0.5, y: 5 }, [line])).toBe(true);
  });

  it('a target exactly on a wall line is not seen (touching the end counts)', () => {
    expect(lineOfSight({ x: 1, y: 5 }, { x: 2, y: 5 }, [lineWall([2, 0], [2, 10])])).toBe(false);
  });
});

function cone(direction: number, angle: number): Cone {
  const value = coneOf(direction, angle);
  if (!value) throw new Error(`cone ${String(direction)} / ${String(angle)} is every side`);
  return value;
}

function polygonArea(polygon: readonly { x: number; y: number }[]): number {
  let doubled = 0;
  polygon.forEach((a, index) => {
    const b = polygon[(index + 1) % polygon.length] ?? a;
    doubled += a.x * b.y - b.x * a.y;
  });
  return Math.abs(doubled) / 2;
}

function distanceFrom(eye: { x: number; y: number }, point: { x: number; y: number }): number {
  return Math.hypot(point.x - eye.x, point.y - eye.y);
}

describe('sightArea of a lantern (a cone without a ring)', () => {
  const eye = { x: 10.5, y: 6.5 };
  const lantern: ViewField = { cone: cone(0, 90), around: null };
  const area = sightArea(eye, [], SCENE, 3, lantern);

  it('the apex is a vertex and every vertex lies in the cone within the reach', () => {
    expect(area).toContainEqual(eye);
    for (const vertex of area) {
      expect(distanceFrom(eye, vertex)).toBeLessThanOrEqual(3 + 1e-9);
      expect(insideCone(lantern.cone, eye, vertex)).toBe(true);
    }
  });

  it.each([1, -1])('the cone edge at %s × 45° is an exact vertex', (side) => {
    const edge = { x: 10.5 + 3 * Math.cos(Math.PI / 4), y: 6.5 + side * 3 * Math.sin(Math.PI / 4) };
    const nearest = Math.min(...area.map((vertex) => distanceFrom(edge, vertex)));
    expect(nearest).toBeLessThan(1e-9);
  });

  it('its area is the sector r²θ/2 (≈ 7.07) within 0.5%', () => {
    const sector = (9 * (Math.PI / 2)) / 2;
    expect(Math.abs(polygonArea(area) - sector) / sector).toBeLessThan(0.005);
  });

  it('no two vertices in a row are the same point', () => {
    area.forEach((vertex, index) => {
      expect(vertex).not.toEqual(area[(index + 1) % area.length]);
    });
  });
});

describe('sightArea of an eye in a cone with its ring', () => {
  const eye = { x: 10.5, y: 6.5 };
  const footprint = { x: 10, y: 6, width: 1, height: 1 };
  const field: ViewField = { cone: cone(0, 90), around: footprint };

  it('the ray straight back stops at the ring, 1.5 from the center', () => {
    const area = sightArea(eye, [], SCENE, 6, field);
    expect(area).toContainEqual({ x: 9, y: 6.5 });
  });

  it('no vertex outside the cone goes past the ring', () => {
    const area = sightArea(eye, [], SCENE, 6, field);
    for (const vertex of area.filter((value) => !insideCone(field.cone, eye, value))) {
      expect(distanceToBox(footprint, vertex)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('a cone across 0° gives one polygon with its vertices in angle order', () => {
    const area = sightArea(eye, [], SCENE, 6, { cone: cone(350, 40), around: footprint });
    const angles = area.map(
      (v) => (Math.atan2(v.y - eye.y, v.x - eye.x) + 2 * Math.PI) % (2 * Math.PI),
    );
    expect(angles).toEqual([...angles].sort((a, b) => a - b));
  });

  it('a 270° cone holds a point above and leaves out one straight back past the ring', () => {
    const area = sightArea(eye, [], SCENE, 6, { cone: cone(0, 270), around: footprint });
    expect(insidePolygon({ x: 10.5, y: 3.5 }, area)).toBe(true);
    expect(insidePolygon({ x: 7.5, y: 6.5 }, area)).toBe(false);
  });

  it('a wall at x = 12 inside the cone cuts every vertex there', () => {
    const area = sightArea(eye, [lineWall([12, 0], [12, 12])], SCENE, 6, field);
    expect(Math.max(...area.map((vertex) => vertex.x))).toBeLessThanOrEqual(12 + 1e-9);
  });

  it('an unlimited reach in a cone stops at the scene border and at the wall', () => {
    const open = sightArea(eye, [], SCENE, Number.POSITIVE_INFINITY, field);
    const walled = sightArea(
      eye,
      [lineWall([15, 0], [15, 12])],
      SCENE,
      Number.POSITIVE_INFINITY,
      field,
    );
    expect(Math.max(...open.map((vertex) => vertex.x))).toBe(20);
    expect(Math.max(...walled.map((vertex) => vertex.x))).toBeCloseTo(15, 9);
  });
});
