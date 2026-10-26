/** The modeled dice: the ones the server throws with physics and the client draws in 3D. The
 *  d100 is a `d100tens` (00 to 90) plus a `d10` for the units. */
export const DIE_KINDS = ['d4', 'd6', 'd8', 'd10', 'd100tens', 'd12', 'd20'] as const;

export type DieKind = (typeof DIE_KINDS)[number];

export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** One face: vertex indices counterclockwise seen from outside (what cannon-es and three expect),
 *  the outward unit normal, the anchor of the number (the face centroid) and the value it shows. */
export interface DieFace {
  readonly vertices: readonly number[];
  readonly normal: Vector3;
  readonly anchor: Vector3;
  readonly value: number;
}

/** A die centered on the origin with the farthest vertex at radius 1. `reads` says which face
 *  gives the value at rest; only the d4 reads `bottom` and carries `vertexValues` (the number of
 *  each corner, printed near it on the three faces that meet there). */
export interface DieShape {
  readonly kind: DieKind;
  readonly reads: 'top' | 'bottom';
  readonly vertices: readonly Vector3[];
  readonly faces: readonly DieFace[];
  readonly vertexValues: readonly number[] | null;
}

/** The world's up axis: a die at rest reads the face whose normal points here. */
export const DIE_UP: Vector3 = Object.freeze({ x: 0, y: 1, z: 0 });

interface Plane {
  readonly normal: Vector3;
  readonly offset: number;
}

interface FaceGeometry {
  readonly vertices: readonly number[];
  readonly normal: Vector3;
  readonly anchor: Vector3;
}

interface ShapeRecipe {
  readonly reads: 'top' | 'bottom';
  readonly vertices: () => Vector3[];
  readonly values: (faces: readonly FaceGeometry[]) => number[];
}

const EPSILON = 1e-6;
const PHI = (1 + Math.sqrt(5)) / 2;
const COS_36 = Math.cos(Math.PI / 5);

/** Dot product of two 3D vectors.
 *
 *  Example: `dot3({ x: 1, y: 2, z: 3 }, { x: 0, y: 1, z: 0 }) // 2` */
export function dot3(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross3(a: Vector3, b: Vector3): Vector3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function subtract3(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale3(vector: Vector3, factor: number): Vector3 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}

function length3(vector: Vector3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function itemAt<T>(list: readonly T[], index: number): T {
  const item = list[index];
  if (item === undefined) {
    throw new RangeError(`Index ${index} is out of range: expected 0 to ${list.length - 1}.`);
  }
  return item;
}

function centroidOf(points: readonly Vector3[]): Vector3 {
  const sum = points.reduce((total, point) => ({
    x: total.x + point.x,
    y: total.y + point.y,
    z: total.z + point.z,
  }));
  return scale3(sum, 1 / points.length);
}

function withSigns(point: Vector3): Vector3[] {
  const signsOf = (value: number): number[] => (value === 0 ? [0] : [value, -value]);
  return signsOf(point.x).flatMap((x) =>
    signsOf(point.y).flatMap((y) => signsOf(point.z).map((z) => ({ x, y, z }))),
  );
}

function signedCycles(point: Vector3): Vector3[] {
  const cycles = [
    point,
    { x: point.z, y: point.x, z: point.y },
    { x: point.y, y: point.z, z: point.x },
  ];
  return cycles.flatMap(withSigns);
}

function tetrahedronVertices(): Vector3[] {
  const radius = (2 * Math.SQRT2) / 3;
  const base = [0, 1, 2].map((k) => {
    const angle = (2 * Math.PI * k) / 3;
    return { x: radius * Math.cos(angle), y: -1 / 3, z: radius * Math.sin(angle) };
  });
  return [{ x: 0, y: 1, z: 0 }, ...base];
}

// The kites of a pentagonal trapezohedron are flat only when pole height h and ring height a
// keep h(1 − cos 36°) = a(1 + cos 36°); with h = 1 the rings sit at ±0.1056.
function trapezohedronVertices(): Vector3[] {
  const ringHeight = (1 - COS_36) / (1 + COS_36);
  const ring = (height: number, offset: number): Vector3[] =>
    [0, 1, 2, 3, 4].map((k) => {
      const angle = (2 * Math.PI * k) / 5 + offset;
      return { x: Math.cos(angle), y: height, z: Math.sin(angle) };
    });
  const poles = [
    { x: 0, y: 1, z: 0 },
    { x: 0, y: -1, z: 0 },
  ];
  return [...poles, ...ring(ringHeight, 0), ...ring(-ringHeight, Math.PI / 5)];
}

function toUnitRadius(vertices: readonly Vector3[]): Vector3[] {
  const radius = Math.max(...vertices.map(length3));
  return vertices.map((vertex) => Object.freeze(scale3(vertex, 1 / radius)));
}

function indexTriples(count: number): [number, number, number][] {
  const indices = [...Array(count).keys()];
  return indices.flatMap((i) =>
    indices
      .slice(i + 1)
      .flatMap((j) => indices.slice(j + 1).map((k): [number, number, number] => [i, j, k])),
  );
}

function planeThrough(a: Vector3, b: Vector3, c: Vector3): Plane | null {
  const normal = cross3(subtract3(b, a), subtract3(c, a));
  const size = length3(normal);
  if (size < EPSILON) return null;
  const unit = scale3(normal, 1 / size);
  const offset = dot3(unit, a);
  return offset < 0 ? { normal: scale3(unit, -1), offset: -offset } : { normal: unit, offset };
}

function supportingPlanes(vertices: readonly Vector3[]): Plane[] {
  const planes: Plane[] = [];
  for (const [i, j, k] of indexTriples(vertices.length)) {
    const plane = planeThrough(itemAt(vertices, i), itemAt(vertices, j), itemAt(vertices, k));
    if (plane === null) continue;
    if (!vertices.every((vertex) => dot3(plane.normal, vertex) <= plane.offset + EPSILON)) continue;
    if (planes.some((known) => dot3(known.normal, plane.normal) > 1 - EPSILON)) continue;
    planes.push(plane);
  }
  return planes;
}

function faceOnPlane(plane: Plane, vertices: readonly Vector3[]): FaceGeometry {
  const onPlane = vertices.flatMap((vertex, index) =>
    Math.abs(dot3(plane.normal, vertex) - plane.offset) < EPSILON ? [index] : [],
  );
  const anchor = centroidOf(onPlane.map((index) => itemAt(vertices, index)));
  const along = subtract3(itemAt(vertices, itemAt(onPlane, 0)), anchor);
  const across = cross3(plane.normal, along);
  const angleOf = (index: number): number => {
    const offset = subtract3(itemAt(vertices, index), anchor);
    return Math.atan2(dot3(offset, across), dot3(offset, along));
  };
  const ordered = [...onPlane].sort((a, b) => angleOf(a) - angleOf(b));
  return { vertices: ordered, normal: plane.normal, anchor };
}

// Rounding (and + 0, which turns −0 into 0) keeps the order stable across float noise.
function rounded(value: number): number {
  return Math.round(value * 1e9) / 1e9 + 0;
}

/** Top faces first, then around the y axis by angle: the same order on server and client. */
function byCanonicalOrder(a: FaceGeometry, b: FaceGeometry): number {
  const height = rounded(b.normal.y) - rounded(a.normal.y);
  if (height !== 0) return height;
  const angleOf = (face: FaceGeometry): number =>
    Math.atan2(rounded(face.normal.z), rounded(face.normal.x));
  return angleOf(a) - angleOf(b);
}

function hullFacesOf(vertices: readonly Vector3[]): FaceGeometry[] {
  return supportingPlanes(vertices)
    .map((plane) => faceOnPlane(plane, vertices))
    .sort(byCanonicalOrder);
}

/** 1, 2, 3… in face order, each with its opposite face taking N + 1 − value. */
function pairedValues(faces: readonly FaceGeometry[]): number[] {
  const values = faces.map(() => 0);
  let next = 1;
  faces.forEach((face, index) => {
    if (values[index] !== 0) return;
    const opposite = faces.findIndex((other) => dot3(other.normal, face.normal) < -1 + EPSILON);
    if (opposite < 0)
      throw new RangeError(`Face ${index} has no opposite face: expected a symmetric die.`);
    values[index] = next;
    values[opposite] = faces.length + 1 - next;
    next += 1;
  });
  return values;
}

const SHAPE_RECIPES: Record<DieKind, ShapeRecipe> = {
  d4: {
    reads: 'bottom',
    vertices: tetrahedronVertices,
    values: (faces) => faces.map((_, i) => i + 1),
  },
  d6: { reads: 'top', vertices: () => withSigns({ x: 1, y: 1, z: 1 }), values: pairedValues },
  d8: { reads: 'top', vertices: () => signedCycles({ x: 1, y: 0, z: 0 }), values: pairedValues },
  // Printed 0–9 like a physical d10 (0 opposite 9, like the d100tens), the 0 reading as 10.
  d10: {
    reads: 'top',
    vertices: trapezohedronVertices,
    values: (faces) => pairedValues(faces).map((value) => (value === 1 ? 10 : value - 1)),
  },
  d100tens: {
    reads: 'top',
    vertices: trapezohedronVertices,
    values: (faces) => pairedValues(faces).map((value) => (value - 1) * 10),
  },
  d12: {
    reads: 'top',
    vertices: () => [
      ...withSigns({ x: 1, y: 1, z: 1 }),
      ...signedCycles({ x: 0, y: 1 / PHI, z: PHI }),
    ],
    values: pairedValues,
  },
  d20: { reads: 'top', vertices: () => signedCycles({ x: 0, y: 1, z: PHI }), values: pairedValues },
};

function cornerValuesOf(faces: readonly DieFace[], vertexCount: number): number[] {
  return Array.from({ length: vertexCount }, (_, vertex) => {
    const opposite = faces.find((face) => !face.vertices.includes(vertex));
    if (opposite === undefined) throw new RangeError(`Corner ${vertex} has no opposite face.`);
    return opposite.value;
  });
}

function buildShape(kind: DieKind): DieShape {
  const recipe = SHAPE_RECIPES[kind];
  const vertices = toUnitRadius(recipe.vertices());
  const geometry = hullFacesOf(vertices);
  const values = recipe.values(geometry);
  const faces = geometry.map((face, index) =>
    Object.freeze({ ...face, value: itemAt(values, index) }),
  );
  const vertexValues =
    recipe.reads === 'bottom' ? Object.freeze(cornerValuesOf(faces, vertices.length)) : null;
  return Object.freeze({ kind, reads: recipe.reads, vertices, faces, vertexValues });
}

const SHAPES = new Map<DieKind, DieShape>();

/** Whether a text is one of the modeled die kinds (the rest is rolled without a model).
 *
 *  Example: `isDieKind('d20') // true` · `isDieKind('d7') // false` */
export function isDieKind(text: string): text is DieKind {
  return (DIE_KINDS as readonly string[]).includes(text);
}

/** The polyhedron of a modeled die, built once and frozen; server physics and client mesh read
 *  the same vertices, faces and values.
 *
 *  Example: `dieShapeOf('d20').faces.length // 20` */
export function dieShapeOf(kind: DieKind): DieShape {
  if (!isDieKind(kind)) {
    throw new RangeError(
      `Die kind "${String(kind)}" is invalid: expected one of ${DIE_KINDS.join(', ')}.`,
    );
  }
  const known = SHAPES.get(kind);
  if (known !== undefined) return known;
  const shape = buildShape(kind);
  SHAPES.set(kind, shape);
  return shape;
}
