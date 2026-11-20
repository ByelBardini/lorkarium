import { describe, expect, it } from 'vitest';

import { formatClockTime } from '@/lib/clock-time';

describe('formatClockTime', () => {
  it('shows a Date as two-digit hour and minute', () => {
    expect(formatClockTime(new Date(2026, 10, 19, 9, 5))).toBe('09:05');
  });

  it('reads an ISO string as the same moment as its Date', () => {
    const at = new Date(2026, 10, 19, 14, 30);

    expect(formatClockTime(at.toISOString())).toBe(formatClockTime(at));
  });
});
