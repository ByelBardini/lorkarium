/** Pointer over the hero, each axis from -1 (left/top edge) to 1 (right/bottom edge). */
export interface PointerPosition {
  x: number;
  y: number;
}

export interface ParallaxInput {
  scrollY: number;
  /** The hero fills the viewport, so its height is how far the layers travel. */
  viewportHeight: number;
  /** 0 stays put, 1 moves the most. */
  depth: number;
  pointer: PointerPosition;
}

export interface ParallaxOffset {
  x: number;
  y: number;
}

export const POINTER_SHIFT_MAX_PX = 24;

/**
 * How far a hero layer moves for the scroll and the pointer; deeper layers move more.
 * Example: `parallaxOffsetOf({ scrollY: 300, viewportHeight: 900, depth: 0.5, pointer: { x: 0, y: 0 } }) // { x: 0, y: 150 }`
 */
export function parallaxOffsetOf({
  scrollY,
  viewportHeight,
  depth,
  pointer,
}: ParallaxInput): ParallaxOffset {
  assertDepth(depth);
  assertViewportHeight(viewportHeight);
  const scrolled = clamp(scrollY, 0, viewportHeight);
  const pointerShift = clamp(pointer.x, -1, 1) * depth * POINTER_SHIFT_MAX_PX;
  return { x: 0 - pointerShift, y: scrolled * depth };
}

function assertDepth(depth: number): void {
  if (depth >= 0 && depth <= 1) return;
  throw new RangeError(`parallax depth ${depth} is invalid: expected a number from 0 to 1`);
}

function assertViewportHeight(height: number): void {
  if (height > 0) return;
  throw new RangeError(
    `viewport height ${height} is invalid: expected a positive number of pixels`,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
