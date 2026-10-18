import type { Vector2 } from './facing';
import type { Wall } from './wall.vo';

/** A straight piece of wall in absolute fractional cells. */
export type Segment = Readonly<{ from: Vector2; to: Vector2 }>;

/** How many straight sides approximate an elliptical wall (and count toward the scene limit). */
export const ELLIPSE_WALL_SEGMENTS = 32;

/** The straight pieces a wall is made of, in absolute cells: one per pair of consecutive points on
 *  the line and the freehand, four closed sides on the rectangle and 32 on the ellipse. Sight and
 *  passage both read these, so the same wall gives the same list on client and server.
 *
 *  Example: `wallSegments(lineFrom2_2To6_2)` → `[{ from: { x: 2, y: 2 }, to: { x: 6, y: 2 } }]` */
export function wallSegments(value: Wall): Segment[] {
  if (value.shape === 'rectangle') return chain(rectangleVertices(value));
  if (value.shape === 'ellipse') return chain(ellipseVertices(value));
  return chain((value.points ?? []).map(([px, py]) => ({ x: value.x + px, y: value.y + py })));
}

function chain(vertices: readonly Vector2[]): Segment[] {
  const segments: Segment[] = [];
  for (let index = 1; index < vertices.length; index += 1) {
    const from = vertices[index - 1];
    const to = vertices[index];
    if (from && to) segments.push({ from, to });
  }
  return segments;
}

function rectangleVertices({ x, y, width, height }: Wall): Vector2[] {
  const right = x + width;
  const bottom = y + height;
  return [
    { x, y },
    { x: right, y },
    { x: right, y: bottom },
    { x, y: bottom },
    { x, y },
  ];
}

function ellipseVertices({ x, y, width, height }: Wall): Vector2[] {
  const center = { x: x + width / 2, y: y + height / 2 };
  const vertices: Vector2[] = [];
  for (let step = 0; step < ELLIPSE_WALL_SEGMENTS; step += 1) {
    const angle = (2 * Math.PI * step) / ELLIPSE_WALL_SEGMENTS;
    vertices.push({
      x: center.x + (width / 2) * Math.cos(angle),
      y: center.y + (height / 2) * Math.sin(angle),
    });
  }
  const first = vertices[0];
  if (first) vertices.push(first);
  return vertices;
}
