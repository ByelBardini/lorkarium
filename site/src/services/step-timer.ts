/** Cancels a step that has not run yet; harmless after it ran. */
export type CancelStep = () => void;

/** Port that runs a callback once after a delay. */
export interface StepTimer {
  after(delayMs: number, callback: () => void): CancelStep;
}

/** `StepTimer` over `setTimeout`. */
export class TimeoutStepTimer implements StepTimer {
  /**
   * Runs the callback once after `delayMs`; the returned function cancels it.
   * Example: `const cancel = new TimeoutStepTimer().after(1_900, playNextStep)`
   */
  after(delayMs: number, callback: () => void): CancelStep {
    const handle = setTimeout(callback, delayMs);
    return () => clearTimeout(handle);
  }
}
