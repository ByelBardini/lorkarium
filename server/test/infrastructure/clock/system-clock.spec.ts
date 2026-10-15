import { describe, expect, it } from 'vitest';
import { SystemClock } from '../../../src/infrastructure/clock/system-clock';

describe('SystemClock', () => {
  it('now() is the wall-clock instant of the call', () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
