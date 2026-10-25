import type { WorldRect } from './token-box';

/** Whether the auras of the board animate this frame. */
export type AuraMotion = 'playing' | 'still';

// 30 frames per second at most: an animated aura asks for whole-canvas renders, and the board
// otherwise renders only when something changed (performance.md, Armadilhas).
export const AURA_FRAME_MS = 1000 / 30;

/** Whether the next step of the auras is due, `nowMs` after the last one at `lastMs`.
 *
 *  Example: `auraFrameDue(0, 20) // false`; `auraFrameDue(0, 34) // true` */
export function auraFrameDue(lastMs: number, nowMs: number): boolean {
  return nowMs - lastMs >= AURA_FRAME_MS;
}

/** The auras play only with "Animar auras" on and without the system's reduced motion.
 *
 *  Example: `auraMotionOf({ enabled: true, reducedMotion: prefersReducedMotion() })` */
export function auraMotionOf(
  input: Readonly<{ enabled: boolean; reducedMotion: boolean }>,
): AuraMotion {
  return input.enabled && !input.reducedMotion ? 'playing' : 'still';
}

/** Whether an aura crosses the view (world px): an aura off screen does not step.
 *
 *  Example: `if (auraOnScreen(aura.worldBox(), visibleWorldRect(camera, screen))) aura.tick(s)` */
export function auraOnScreen(box: WorldRect, visible: WorldRect): boolean {
  return (
    box.x < visible.x + visible.width &&
    box.x + box.width > visible.x &&
    box.y < visible.y + visible.height &&
    box.y + box.height > visible.y
  );
}
