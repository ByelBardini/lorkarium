/** Port for the visitor's motion preference (`prefers-reduced-motion`). */
export interface MotionPreference {
  prefersReduced(): boolean;
}

type MatchMedia = (query: string) => { matches: boolean };

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** `MotionPreference` over `matchMedia`; a browser without it counts as no preference. */
export class MediaQueryMotionPreference implements MotionPreference {
  // Bound: a detached `matchMedia` throws "Illegal invocation" in the browser.
  constructor(
    private readonly matchMedia: MatchMedia | undefined = globalThis.matchMedia?.bind(globalThis),
  ) {}

  /**
   * True when the visitor asked the system for less motion.
   * Example: `new MediaQueryMotionPreference().prefersReduced() // false`
   */
  prefersReduced(): boolean {
    return this.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
  }
}
