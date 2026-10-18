import type { Point } from './camera';
import type { wheelIntent } from './camera-input';

/** Whether the viewer asked the system for less motion: tokens jump instead of gliding. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The pointer on the canvas, in screen px from its top-left corner. */
export function pointOf(event: PointerEvent): Point {
  return { x: event.offsetX, y: event.offsetY };
}

/** The fields of a wheel event that `wheelIntent` reads (without the point). */
export function wheelFields(event: WheelEvent): Omit<Parameters<typeof wheelIntent>[0], 'x' | 'y'> {
  const { deltaX, deltaY, deltaMode, ctrlKey, metaKey, shiftKey } = event;
  return { deltaX, deltaY, deltaMode, ctrlKey, metaKey, shiftKey };
}
