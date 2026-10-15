import type { SchedulerPort } from '../../modules/sessions/scheduler.port';

/** `setTimeout` by key; `cancelAll` on shutdown so no pending timer holds the process open.
 *
 *  Example: `scheduler.schedule(`${campaignId}:${userId}`, 5000, () => service.expire(...))` */
export class TimerScheduler implements SchedulerPort {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  schedule(key: string, delayMs: number, task: () => void): void {
    this.cancel(key);
    const timer = setTimeout(() => {
      this.timers.delete(key);
      task();
    }, delayMs);
    this.timers.set(key, timer);
  }

  cancel(key: string): void {
    clearTimeout(this.timers.get(key));
    this.timers.delete(key);
  }

  cancelAll(): void {
    for (const key of [...this.timers.keys()]) this.cancel(key);
  }
}
