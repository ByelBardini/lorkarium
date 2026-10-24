import { describe, expect, it } from 'vitest';
import { groupedSecret, recoveryCodesText } from '@/lib/two-factor-text';

describe('groupedSecret', () => {
  it('splits the key in upper-case groups of 4', () => {
    expect(groupedSecret('jbswy3dpehpk3pxp')).toBe('JBSW Y3DP EHPK 3PXP');
  });

  it('a key whose length is not a multiple of 4 keeps the rest in the last group', () => {
    expect(groupedSecret('ABCDEF')).toBe('ABCD EF');
  });
});

describe('recoveryCodesText', () => {
  it('writes a heading with the @ and then one code per line', () => {
    const lines = recoveryCodesText(['k7m2p-9qrst', 'h7m2p-9qrsu'], '@ana').split('\n');
    expect(lines[0]).toContain('@ana');
    expect(lines.slice(-3)).toEqual(['k7m2p-9qrst', 'h7m2p-9qrsu', '']);
  });
});
