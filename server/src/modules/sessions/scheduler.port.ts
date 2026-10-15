/** Delayed work by key (the presence grace period), swapped for a fake that fires on demand. */
export interface SchedulerPort {
  /** Replaces any task already pending under `key`. */
  schedule(key: string, delayMs: number, task: () => void): void;
  cancel(key: string): void;
}
