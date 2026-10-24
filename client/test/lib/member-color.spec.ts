import { describe, expect, it } from 'vitest';
import { MEMBER_COLOR_HEX, memberColorCss } from '@/lib/member-color';

describe('MEMBER_COLOR_HEX', () => {
  it('each of the 8 names keeps the hex the ping always used', () => {
    expect(MEMBER_COLOR_HEX).toEqual({
      gold: 0xe0b25c,
      steel: 0x6fa8dc,
      ember: 0xe0704f,
      moss: 0x8cc084,
      violet: 0xb39ddb,
      rose: 0xe58fb4,
      teal: 0x5cc8c0,
      bone: 0xf0e6d2,
    });
  });
});

describe('memberColorCss', () => {
  it.each([
    ['gold', '#e0b25c'],
    ['steel', '#6fa8dc'],
    ['bone', '#f0e6d2'],
  ] as const)('%s is written as %s', (color, expected) => {
    expect(memberColorCss(color)).toBe(expected);
  });
});
