import type { Point } from './camera';

/** The size of the canvas, in screen px. */
export type ScreenSize = Readonly<{ width: number; height: number }>;

/** The arrow of a ping off screen: where it sits (screen px) and the angle it points at, in
 *  radians from the +x axis (y grows downward). */
export type PingEdge = Readonly<{ x: number; y: number; angle: number }>;

/** The arrow for a ping at `point` (screen px), or `null` when the ping is on screen. The arrow
 *  is the point pinned `margin` px inside the edges, pointing at the ping.
 *
 *  Example: `pingEdgeOf({ x: 1300, y: 300 }, { width: 800, height: 600 }, 24) // { x: 776, y: 300, angle: 0 }` */
export function pingEdgeOf(point: Point, screen: ScreenSize, margin: number): PingEdge | null {
  const onScreen =
    point.x >= 0 && point.x <= screen.width && point.y >= 0 && point.y <= screen.height;
  if (onScreen) return null;
  const x = Math.min(Math.max(point.x, margin), screen.width - margin);
  const y = Math.min(Math.max(point.y, margin), screen.height - margin);
  return { x, y, angle: Math.atan2(point.y - y, point.x - x) };
}
