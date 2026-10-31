import type { CancelStep, StepTimer } from '@/services/step-timer';

interface ScheduledStep {
  at: number;
  callback: () => void;
}

/** Virtual clock: `advance(ms)` runs every step due in that window, in time order. */
export class StepTimerFake implements StepTimer {
  private now = 0;
  private scheduled: ScheduledStep[] = [];

  get pending(): number {
    return this.scheduled.length;
  }

  after(delayMs: number, callback: () => void): CancelStep {
    const step = { at: this.now + delayMs, callback };
    this.scheduled.push(step);
    return () => this.drop(step);
  }

  advance(ms: number): void {
    const end = this.now + ms;
    for (let step = this.nextDue(end); step; step = this.nextDue(end)) {
      this.drop(step);
      this.now = step.at;
      step.callback();
    }
    this.now = end;
  }

  private nextDue(end: number): ScheduledStep | undefined {
    const due = this.scheduled.filter((step) => step.at <= end);
    return due.sort((a, b) => a.at - b.at)[0];
  }

  private drop(step: ScheduledStep): void {
    this.scheduled = this.scheduled.filter((other) => other !== step);
  }
}
