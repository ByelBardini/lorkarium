import { describe, expect, it } from 'vitest';
import { hpFillOf } from '@/lib/hit-points';

describe('hpFillOf', () => {
  it('gives the filled share of the bar as a percentage with one decimal', () => {
    expect(hpFillOf(41, 68)).toBe('60.3');
  });

  it('empties the bar of a downed combatant', () => {
    expect(hpFillOf(0, 68)).toBe('0.0');
  });

  it('never overfills the bar', () => {
    expect(hpFillOf(80, 68)).toBe('100.0');
  });

  it.each([0, -5, Number.NaN])('refuses a maximum of %s naming the expected shape', (maxHp) => {
    expect(() => hpFillOf(10, maxHp)).toThrow(/maxHp.*positive/);
  });
});
