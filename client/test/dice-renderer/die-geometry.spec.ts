import { describe, expect, it } from 'vitest';
import { DIE_KINDS, dieShapeOf } from '@lorkarium/game-core';
import { dieGeometryOf } from '@/dice-renderer/die-geometry';

describe('dieGeometryOf', () => {
  it.each([
    ['d4', 4],
    ['d6', 12],
    ['d8', 8],
    ['d10', 20],
    ['d100tens', 20],
    ['d12', 36],
    ['d20', 20],
  ] as const)('%s is drawn with %i triangles', (kind, triangles) => {
    const geometry = dieGeometryOf(kind);
    expect(geometry.triangleCount).toBe(triangles);
    expect(geometry.positions).toHaveLength(triangles * 9);
    expect(geometry.normals).toHaveLength(triangles * 9);
    expect(geometry.uvs).toHaveLength(triangles * 6);
  });

  it('d6 has 6 number anchors, one at the center of each face', () => {
    const labels = dieGeometryOf('d6').labels;
    const anchors = dieShapeOf('d6').faces.map((face) => face.anchor);
    expect(labels.map((label) => label.position)).toEqual(anchors);
  });

  it('d6 labels read the value of their face', () => {
    const labels = dieGeometryOf('d6').labels.map((label) => label.text);
    expect(labels).toEqual(dieShapeOf('d6').faces.map((face) => String(face.value)));
  });

  it('d20 marks 6 and 9 with a dot so they are not read upside down', () => {
    const texts = dieGeometryOf('d20').labels.map((label) => label.text);
    expect(texts).toContain('6.');
    expect(texts).toContain('9.');
    expect(texts).not.toContain('6');
  });

  it('d100tens shows two digits (00 to 90) and d10 shows its 10 as 0', () => {
    expect(
      dieGeometryOf('d100tens')
        .labels.map((label) => label.text)
        .sort(),
    ).toEqual(['00', '10', '20', '30', '40', '50', '60', '70', '80', '90']);
    expect(dieGeometryOf('d10').labels.map((label) => label.text)).toContain('0');
  });

  it('d4 prints the corner value near each of the 3 corners of each face (12 labels)', () => {
    const shape = dieShapeOf('d4');
    const labels = dieGeometryOf('d4').labels;
    expect(labels).toHaveLength(12);
    const firstFace = shape.faces[0];
    const cornerTexts = firstFace?.vertices.map((vertex) => String(shape.vertexValues?.[vertex]));
    expect(labels.slice(0, 3).map((label) => label.text)).toEqual(cornerTexts);
  });

  it.each(DIE_KINDS)('every %s triangle uses the normal of its face', (kind) => {
    const geometry = dieGeometryOf(kind);
    const faceNormals = new Set(
      dieShapeOf(kind).faces.map(({ normal }) =>
        [normal.x, normal.y, normal.z].map((axis) => Math.fround(axis)).join(','),
      ),
    );
    for (let i = 0; i < geometry.normals.length; i += 3) {
      const normal = Array.from(geometry.normals.slice(i, i + 3)).join(',');
      expect(faceNormals.has(normal)).toBe(true);
    }
  });

  it.each(DIE_KINDS)('every %s triangle winds counterclockwise seen from outside', (kind) => {
    const { positions, normals } = dieGeometryOf(kind);
    for (let i = 0; i < positions.length; i += 9) {
      const [ax = 0, ay = 0, az = 0, bx = 0, by = 0, bz = 0, cx = 0, cy = 0, cz = 0] =
        positions.slice(i, i + 9);
      const [ux, uy, uz, vx, vy, vz] = [bx - ax, by - ay, bz - az, cx - ax, cy - ay, cz - az];
      const winding = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const [nx = 0, ny = 0, nz = 0] = normals.slice(i, i + 3);
      expect(
        (winding[0] ?? 0) * nx + (winding[1] ?? 0) * ny + (winding[2] ?? 0) * nz,
      ).toBeGreaterThan(0);
    }
  });

  it.each(DIE_KINDS)('every %s face has its UV inside [0, 1]', (kind) => {
    const uvs = Array.from(dieGeometryOf(kind).uvs);
    expect(Math.min(...uvs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...uvs)).toBeLessThanOrEqual(1);
  });

  it('each face of d6 spans the whole texture on its longest axis', () => {
    const uvs = Array.from(dieGeometryOf('d6').uvs.slice(0, 12));
    expect(Math.min(...uvs)).toBeCloseTo(0, 6);
    expect(Math.max(...uvs)).toBeCloseTo(1, 6);
  });

  it('every label sits on its face with an up direction lying in the face plane', () => {
    for (const label of dieGeometryOf('d12').labels) {
      const { up, normal } = label;
      expect(up.x * normal.x + up.y * normal.y + up.z * normal.z).toBeCloseTo(0, 6);
      expect(Math.hypot(up.x, up.y, up.z)).toBeCloseTo(1, 6);
      expect(label.size).toBeGreaterThan(0);
    }
  });

  it('the geometry of a kind is built once: a second call returns the same identity', () => {
    expect(dieGeometryOf('d20')).toBe(dieGeometryOf('d20'));
  });
});
