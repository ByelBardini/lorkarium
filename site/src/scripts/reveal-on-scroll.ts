import type { MotionPreference } from '@/services/motion-preference';
import type { ViewportWatch } from '@/services/viewport-watch';

export interface RevealContext {
  /** `null` when the browser has no `IntersectionObserver`. */
  watch: ViewportWatch | null;
  motion: MotionPreference;
}

/** The section reveals a little before its top reaches the bottom edge of the screen. */
export const REVEAL_ROOT_MARGIN = '0px 0px -12% 0px';

/**
 * Reveals each `[data-reveal]` as it enters the viewport; `html[data-motion]` turns on the CSS
 * that hides them first, so without JS, observer or motion nothing ever stays hidden.
 * Example: `startRevealOnScroll(document, { watch: browserViewportWatch(window, { rootMargin: REVEAL_ROOT_MARGIN }), motion: new MediaQueryMotionPreference() })`
 */
export function startRevealOnScroll(root: Document, { watch, motion }: RevealContext): void {
  const pending = [...root.querySelectorAll('[data-reveal]:not([data-revealed])')];
  if (watch === null || motion.prefersReduced()) {
    for (const element of pending) reveal(element);
    return;
  }
  root.documentElement.setAttribute('data-motion', '');
  for (const element of pending) revealOnEnter(element, watch);
}

function revealOnEnter(element: Element, watch: ViewportWatch): void {
  watch.observe(element, (inView) => {
    if (!inView) return;
    reveal(element);
    watch.unobserve(element);
  });
}

function reveal(element: Element): void {
  element.setAttribute('data-revealed', '');
}
