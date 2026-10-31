import type { FrameScheduler } from '@/services/frame-scheduler';

/** Holds the requested callbacks until `flush()` plays one frame. */
export class FrameSchedulerFake implements FrameScheduler {
  private queued: Array<() => void> = [];

  get pending(): number {
    return this.queued.length;
  }

  request(callback: () => void): void {
    this.queued.push(callback);
  }

  /** Runs the callbacks of this frame; one requested meanwhile waits for the next flush. */
  flush(): void {
    const frame = this.queued;
    this.queued = [];
    for (const callback of frame) callback();
  }
}
