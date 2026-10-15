import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimerScheduler } from '../../../src/infrastructure/scheduler/timer-scheduler';

describe('TimerScheduler', () => {
  let ran: string[];
  let scheduler: TimerScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    ran = [];
    scheduler = new TimerScheduler();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('a task scheduled for 5000 ms has not run at 4999 ms and has run at 5000 ms', () => {
    scheduler.schedule('vharn:ana', 5000, () => ran.push('expired'));
    vi.advanceTimersByTime(4999);
    expect(ran).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(ran).toEqual(['expired']);
  });

  it('a cancelled task never runs', () => {
    scheduler.schedule('vharn:ana', 5000, () => ran.push('expired'));
    scheduler.cancel('vharn:ana');
    vi.advanceTimersByTime(10_000);
    expect(ran).toEqual([]);
  });

  it('scheduling the same key again replaces the earlier task', () => {
    scheduler.schedule('vharn:ana', 5000, () => ran.push('first'));
    scheduler.schedule('vharn:ana', 5000, () => ran.push('second'));
    vi.advanceTimersByTime(5000);
    expect(ran).toEqual(['second']);
  });

  it('tasks under different keys run independently', () => {
    scheduler.schedule('vharn:ana', 5000, () => ran.push('ana'));
    scheduler.schedule('vharn:bia', 5000, () => ran.push('bia'));
    scheduler.cancel('vharn:ana');
    vi.advanceTimersByTime(5000);
    expect(ran).toEqual(['bia']);
  });

  it('cancelling an unknown key leaves the pending tasks alone', () => {
    scheduler.schedule('vharn:ana', 5000, () => ran.push('ana'));
    scheduler.cancel('nobody');
    vi.advanceTimersByTime(5000);
    expect(ran).toEqual(['ana']);
  });

  it('cancelAll stops every pending task', () => {
    scheduler.schedule('vharn:ana', 5000, () => ran.push('ana'));
    scheduler.schedule('vharn:bia', 5000, () => ran.push('bia'));
    scheduler.cancelAll();
    vi.advanceTimersByTime(5000);
    expect(ran).toEqual([]);
  });
});
