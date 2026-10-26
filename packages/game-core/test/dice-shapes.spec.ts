import { describe, expect, it } from 'vitest';
import {
  DIE_KINDS,
  DIE_UP,
  dieShapeOf,
  isDieKind,
  type DieKind,
  type DieShape,
  type Vector3,
} from '../src/dice-shapes';

function minus(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dotOf(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function crossOf(a: Vector3, b: Vector3): Vector3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function vertexOf(shape: DieShape, index: number): Vector3 {
  const vertex = shape.vertices[index];
  if (vertex === undefined) throw new Error(`vertex ${index} missing in ${shape.kind}`);
  return vertex;
}

function sortedValuesOf(kind: DieKind): number[] {
  return dieShapeOf(kind)
    .faces.map((face) => face.value)
    .sort((a, b) => a - b);
}

function oppositeSumsOf(kind: DieKind): number[] {
  const faces = dieShapeOf(kind).faces;
  return faces.map((face) => {
    const opposite = faces.find((other) => dotOf(other.normal, face.normal) < -0.999999);
    return face.value + (opposite?.value ?? Number.NaN);
  });
}

describe('dieShapeOf', () => {
  it.each([
    ['d4', 4],
    ['d6', 6],
    ['d8', 8],
    ['d10', 10],
    ['d100tens', 10],
    ['d12', 12],
    ['d20', 20],
  ] as const)('%s has %i faces', (kind, count) => {
    expect(dieShapeOf(kind).faces).toHaveLength(count);
  });

  it.each([
    ['d4', [1, 2, 3, 4]],
    ['d6', [1, 2, 3, 4, 5, 6]],
    ['d8', [1, 2, 3, 4, 5, 6, 7, 8]],
    ['d10', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
    ['d100tens', [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]],
    ['d12', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]],
    ['d20', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]],
  ] as const)('%s uses each of its values exactly once: %j', (kind, values) => {
    expect(sortedValuesOf(kind)).toEqual(values);
  });

  it.each([
    ['d6', 7],
    ['d8', 9],
    ['d12', 13],
    ['d20', 21],
    ['d100tens', 90],
  ] as const)('opposite faces of %s always sum to %i', (kind, sum) => {
    expect(new Set(oppositeSumsOf(kind))).toEqual(new Set([sum]));
  });

  it('the printed faces of the d10 (10 shows as 0) pair like a physical 0–9 die: opposites sum to 9', () => {
    const faces = dieShapeOf('d10').faces;
    const printedSums = faces.map((face) => {
      const opposite = faces.find((other) => dotOf(other.normal, face.normal) < -0.999999);
      return (face.value % 10) + ((opposite?.value ?? Number.NaN) % 10);
    });
    expect(new Set(printedSums)).toEqual(new Set([9]));
  });

  it.each(DIE_KINDS)('every face normal of %s is unit and points outward', (kind) => {
    for (const face of dieShapeOf(kind).faces) {
      expect(Math.hypot(face.normal.x, face.normal.y, face.normal.z)).toBeCloseTo(1, 9);
      expect(dotOf(face.normal, face.anchor)).toBeGreaterThan(0);
    }
  });

  it.each(DIE_KINDS)(
    'every face of %s is flat and wound counterclockwise seen from outside',
    (kind) => {
      const shape = dieShapeOf(kind);
      for (const face of shape.faces) {
        const [a, b, c] = face.vertices.slice(0, 3).map((index) => vertexOf(shape, index));
        if (!a || !b || !c) throw new Error(`face of ${kind} with fewer than 3 vertices`);
        expect(dotOf(crossOf(minus(b, a), minus(c, a)), face.normal)).toBeGreaterThan(0);
        const offsets = face.vertices.map((index) => dotOf(face.normal, vertexOf(shape, index)));
        for (const offset of offsets) expect(offset).toBeCloseTo(dotOf(face.normal, a), 9);
      }
    },
  );

  it.each(DIE_KINDS)('the farthest vertex of %s sits at radius 1 (world size)', (kind) => {
    const radii = dieShapeOf(kind).vertices.map((vertex) =>
      Math.hypot(vertex.x, vertex.y, vertex.z),
    );
    expect(Math.max(...radii)).toBeCloseTo(1, 9);
  });

  it.each([
    ['d4', 3],
    ['d6', 4],
    ['d8', 3],
    ['d10', 4],
    ['d12', 5],
    ['d20', 3],
  ] as const)('every face of %s has %i vertices (kites on the d10)', (kind, corners) => {
    const counts = dieShapeOf(kind).faces.map((face) => face.vertices.length);
    expect(new Set(counts)).toEqual(new Set([corners]));
  });

  it('the anchor of a d6 face is the center of the square, at 1/√3 from the center', () => {
    const top = dieShapeOf('d6').faces.find((face) => face.normal.y > 0.999);
    expect(top?.anchor.x).toBeCloseTo(0, 9);
    expect(top?.anchor.y).toBeCloseTo(1 / Math.sqrt(3), 9);
    expect(top?.anchor.z).toBeCloseTo(0, 9);
  });

  it('the d6 rests with 1 facing up (0, 1, 0) and 6 facing down', () => {
    const faces = dieShapeOf('d6').faces;
    expect(faces.find((face) => dotOf(face.normal, DIE_UP) > 0.999)?.value).toBe(1);
    expect(faces.find((face) => dotOf(face.normal, DIE_UP) < -0.999)?.value).toBe(6);
  });

  it('the d4 sits on a face pointing down with a corner straight up', () => {
    const shape = dieShapeOf('d4');
    expect(shape.reads).toBe('bottom');
    expect(shape.faces.some((face) => face.normal.y < -0.999)).toBe(true);
    expect(shape.vertices.some((vertex) => vertex.y > 0.999)).toBe(true);
  });

  it('each d4 corner carries the value of the face opposite to it', () => {
    const shape = dieShapeOf('d4');
    const expected = shape.vertices.map(
      (_, vertex) => shape.faces.find((face) => !face.vertices.includes(vertex))?.value,
    );
    expect(shape.vertexValues).toEqual(expected);
    expect([...(shape.vertexValues ?? [])].sort()).toEqual([1, 2, 3, 4]);
  });

  it.each(['d6', 'd8', 'd10', 'd100tens', 'd12', 'd20'] as const)(
    '%s reads the top face and has no corner values',
    (kind) => {
      expect(dieShapeOf(kind).reads).toBe('top');
      expect(dieShapeOf(kind).vertexValues).toBeNull();
    },
  );

  it('an unknown kind is refused citing the value and the accepted kinds', () => {
    expect(() => dieShapeOf('d3' as DieKind)).toThrow(
      /Die kind "d3" is invalid: expected one of d4, d6, d8, d10, d100tens, d12, d20/,
    );
  });
});

describe('isDieKind', () => {
  it.each([
    ['d20', true],
    ['d100tens', true],
    ['d100', false],
    ['d7', false],
  ])('%s is a modeled die: %s', (text, expected) => {
    expect(isDieKind(text)).toBe(expected);
  });
});
