import type { MotionPreference } from '@/services/motion-preference';

/** Motion allowed until `reduce()`, like a visitor who turned on "reduce motion". */
export class MotionPreferenceFake implements MotionPreference {
  private reduced = false;

  reduce(): this {
    this.reduced = true;
    return this;
  }

  prefersReduced(): boolean {
    return this.reduced;
  }
}
