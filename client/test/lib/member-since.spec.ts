import { describe, expect, it } from 'vitest';
import { memberSinceLabel } from '@/lib/member-since';

describe('memberSinceLabel', () => {
  it('names the month and the year of the account, in local time', () => {
    expect(memberSinceLabel(new Date(2026, 9, 1, 12).toISOString())).toBe(
      'Na mesa desde outubro de 2026',
    );
  });

  it('march keeps its cedilla', () => {
    expect(memberSinceLabel(new Date(2025, 2, 15).toISOString())).toBe(
      'Na mesa desde março de 2025',
    );
  });

  it('a text that is not a date is refused citing it', () => {
    expect(() => memberSinceLabel('ontem')).toThrow(/"ontem".*ISO/);
  });
});
