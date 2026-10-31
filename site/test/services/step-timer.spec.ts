import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimeoutStepTimer } from '@/services/step-timer';

describe('TimeoutStepTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the step once the delay has passed, not before', () => {
    const ran: number[] = [];
    new TimeoutStepTimer().after(1_900, () => ran.push(Date.now()));

    vi.advanceTimersByTime(1_899);
    expect(ran).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(ran).toHaveLength(1);
  });

  it('a cancelled step never runs', () => {
    const ran: string[] = [];
    const cancel = new TimeoutStepTimer().after(1_900, () => ran.push('step'));

    cancel();
    vi.advanceTimersByTime(5_000);

    expect(ran).toEqual([]);
  });
});
