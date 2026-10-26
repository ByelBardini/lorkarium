import {
  dieShapeOf,
  type DieFace,
  type DieKind,
  type DieShape,
  type Vector3,
} from '@lorkarium/game-core';

/** Where one number is printed: on the face plane at `position`, facing out along `normal`,
 *  its top toward `up` (unit, in the plane) and `size` its height in die units. */
export interface DieLabel {
  readonly text: string;
  readonly position: Vector3;
  readonly normal: Vector3;
  readonly up: Vector3;
  readonly size: number;
}

/** The flat-shaded mesh of a die (radius 1), non-indexed: 3 vertices per triangle, each face a
 *  fan whose UV maps the face onto the whole texture, plus the labels of the numbers. The
 *  arrays are shared between calls; read them, never write. */
export interface DieGeometry {
  readonly kind: DieKind;
  readonly triangleCount: number;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly labels: readonly DieLabel[];
}

// Height of a number against the distance from the face center to its nearest edge.
const FACE_LABEL_SIZE = 0.9;
// The d4 prints near each corner: how far from the center toward it, and its size.
const CORNER_LABEL_REACH = 0.55;
const CORNER_LABEL_SIZE = 0.6;

function sub(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function lengthOf(vector: Vector3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function unit(vector: Vector3): Vector3 {
  const length = lengthOf(vector);
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function along(origin: Vector3, direction: Vector3, distance: number): Vector3 {
  return {
    x: origin.x + direction.x * distance,
    y: origin.y + direction.y * distance,
    z: origin.z + direction.z * distance,
  };
}

function cornersOf(shape: DieShape, face: DieFace): Vector3[] {
  return face.vertices.map((index) => {
    const corner = shape.vertices[index];
    if (corner === undefined) {
      throw new RangeError(
        `Face vertex ${index} of ${shape.kind} is out of range: expected 0 to ${shape.vertices.length - 1}.`,
      );
    }
    return corner;
  });
}

function upOf(face: DieFace, toward: Vector3): Vector3 {
  const offset = sub(toward, face.anchor);
  return unit(along(offset, face.normal, -dot(offset, face.normal)));
}

function faceUvsOf(face: DieFace, corners: readonly Vector3[]): [number, number][] {
  const first = corners[0] ?? face.anchor;
  const uAxis = upOf(face, first);
  const vAxis = cross(face.normal, uAxis);
  const flat = corners.map((corner) => {
    const offset = sub(corner, face.anchor);
    return [dot(offset, uAxis), dot(offset, vAxis)] as const;
  });
  const reach = Math.max(...flat.flatMap(([u, v]) => [Math.abs(u), Math.abs(v)]));
  return flat.map(([u, v]) => [0.5 + u / (2 * reach), 0.5 + v / (2 * reach)]);
}

function inradiusOf(face: DieFace, corners: readonly Vector3[]): number {
  return Math.min(
    ...corners.map((corner, index) => {
      const next = corners[(index + 1) % corners.length] ?? corner;
      const edge = sub(next, corner);
      return lengthOf(cross(edge, sub(face.anchor, corner))) / lengthOf(edge);
    }),
  );
}

function fanOf(count: number): number[] {
  return Array.from({ length: count - 2 }, (_, index) => [0, index + 1, index + 2]).flat();
}

interface MeshArrays {
  positions: number[];
  normals: number[];
  uvs: number[];
}

function pushFace(arrays: MeshArrays, face: DieFace, corners: readonly Vector3[]): void {
  const uvs = faceUvsOf(face, corners);
  for (const index of fanOf(corners.length)) {
    const corner = corners[index] ?? face.anchor;
    arrays.positions.push(corner.x, corner.y, corner.z);
    arrays.normals.push(face.normal.x, face.normal.y, face.normal.z);
    arrays.uvs.push(...(uvs[index] ?? [0.5, 0.5]));
  }
}

function hasBothSixAndNine(shape: DieShape): boolean {
  const values = shape.faces.map((face) => face.value);
  return values.includes(6) && values.includes(9);
}

function faceTextOf(shape: DieShape, value: number): string {
  if (shape.kind === 'd100tens') return String(value).padStart(2, '0');
  if (shape.kind === 'd10' && value === 10) return '0';
  const marked = hasBothSixAndNine(shape) && (value === 6 || value === 9);
  return marked ? `${value}.` : String(value);
}

function cornerLabelsOf(shape: DieShape, face: DieFace, corners: readonly Vector3[]): DieLabel[] {
  const size = inradiusOf(face, corners) * CORNER_LABEL_SIZE;
  return face.vertices.map((vertex, index) => {
    const corner = corners[index] ?? face.anchor;
    const up = upOf(face, corner);
    const reach = lengthOf(sub(corner, face.anchor)) * CORNER_LABEL_REACH;
    const text = String(shape.vertexValues?.[vertex] ?? '');
    return { text, position: along(face.anchor, up, reach), normal: face.normal, up, size };
  });
}

function labelsOf(shape: DieShape, face: DieFace, corners: readonly Vector3[]): DieLabel[] {
  if (shape.vertexValues !== null) return cornerLabelsOf(shape, face, corners);
  const up = upOf(face, corners[0] ?? face.anchor);
  const size = inradiusOf(face, corners) * FACE_LABEL_SIZE;
  const text = faceTextOf(shape, face.value);
  return [{ text, position: face.anchor, normal: face.normal, up, size }];
}

function buildGeometry(kind: DieKind): DieGeometry {
  const shape = dieShapeOf(kind);
  const arrays: MeshArrays = { positions: [], normals: [], uvs: [] };
  const labels = shape.faces.flatMap((face) => {
    const corners = cornersOf(shape, face);
    pushFace(arrays, face, corners);
    return labelsOf(shape, face, corners);
  });
  return {
    kind,
    triangleCount: arrays.positions.length / 9,
    positions: new Float32Array(arrays.positions),
    normals: new Float32Array(arrays.normals),
    uvs: new Float32Array(arrays.uvs),
    labels: Object.freeze(labels),
  };
}

const GEOMETRIES = new Map<DieKind, DieGeometry>();

/** The mesh of a die kind, built once from `dieShapeOf` (the same polyhedron the server
 *  throws): fan triangles per face, the face normal on each vertex, UV in [0, 1] per face,
 *  and the number labels (one per face; the d4 one per corner of each face).
 *
 *  Example: `dieGeometryOf('d6').triangleCount // 12` */
export function dieGeometryOf(kind: DieKind): DieGeometry {
  const known = GEOMETRIES.get(kind);
  if (known !== undefined) return known;
  const geometry = buildGeometry(kind);
  GEOMETRIES.set(kind, geometry);
  return geometry;
}
