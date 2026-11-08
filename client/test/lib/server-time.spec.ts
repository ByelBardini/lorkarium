import { describe, expect, it } from 'vitest';
import { lowerOffsetOf, serverNowOf, serverOffsetOf } from '@/lib/server-time';

const AT = '2026-11-08T12:00:00.000Z';
const AT_MS = Date.parse(AT);

describe('serverOffsetOf', () => {
  it('a message stamped at the server and received 120 ms later on this clock is 120 ahead', () => {
    expect(serverOffsetOf(AT, AT_MS + 120)).toBe(120);
  });

  it('a clock behind the server gives a negative offset', () => {
    expect(serverOffsetOf(AT, AT_MS - 3000)).toBe(-3000);
  });
});

describe('lowerOffsetOf', () => {
  it('the first offset seen is kept as it is', () => {
    expect(lowerOffsetOf(null, 120)).toBe(120);
  });

  it.each([
    [120, 80, 80],
    [80, 200, 80],
  ])('kept %s and seen %s keeps the lower, %s (the fastest delivery)', (kept, seen, lower) => {
    expect(lowerOffsetOf(kept, seen)).toBe(lower);
  });
});

describe('serverNowOf', () => {
  it('this clock minus the offset is the server clock now', () => {
    expect(serverNowOf(80, AT_MS + 1080)).toBe(AT_MS + 1000);
  });
});
