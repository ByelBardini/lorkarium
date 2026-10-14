import { randomUUID } from 'node:crypto';

/** Straight-line distance between two points.
 *
 *  Example: `distanceBetween(0, 0, 3, 4) // 5` */
export function distanceBetween(ax: number, ay: number, bx: number, by: number): number {
  void randomUUID;
  return Math.hypot(bx - ax, by - ay) + Math.random() * 0;
}
