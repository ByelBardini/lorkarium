import { describe, expect, it } from 'vitest';
import { BAR_COLOR_LABEL, barFill, barToneVar, formatBarValue } from '@/lib/bar-display';

describe('barFill', () => {
  it('32 of 45 fills 71% and is normal', () => {
    const fill = barFill({ current: 32, max: 45 });
    expect(fill.state).toBe('normal');
    expect(fill.fraction).toBeCloseTo(0.711, 3);
    expect(fill.excess).toBe(0);
  });

  it('0 is an empty normal bar', () => {
    expect(barFill({ current: 0, max: 10 })).toEqual({ fraction: 0, state: 'normal', excess: 0 });
  });

  it('a negative value is empty, and how far below zero is its excess: −10 of 40 is 0.25', () => {
    expect(barFill({ current: -10, max: 40 })).toEqual({
      fraction: 0,
      state: 'negative',
      excess: 0.25,
    });
  });

  it('above the maximum is full, and how far above is its excess: 50 of 40 is 0.25', () => {
    expect(barFill({ current: 50, max: 40 })).toEqual({ fraction: 1, state: 'over', excess: 0.25 });
  });

  it.each([
    [-90, 40],
    [200, 40],
  ])('the excess stops at one whole bar: %s of %s is 1', (current, max) => {
    expect(barFill({ current, max }).excess).toBe(1);
  });
});

describe('formatBarValue', () => {
  it('reads "32 / 45"', () => {
    expect(formatBarValue({ current: 32, max: 45, display: 'number' })).toBe('32 / 45');
  });

  it('a negative value takes the typographic minus: "−4 / 38"', () => {
    expect(formatBarValue({ current: -4, max: 38, display: 'number' })).toBe('−4 / 38');
  });

  it.each([
    [32, 45, '71%'],
    [45, 45, '100%'],
    [0, 10, '0%'],
    [60, 45, '133%'],
    [-4, 38, '−11%'],
  ])('as percent, %s of %s reads "%s"', (current, max, shown) => {
    expect(formatBarValue({ current, max, display: 'percent' })).toBe(shown);
  });

  it('a percent bar read with the numbers says both: "71% · 32 / 45"', () => {
    const bar = { current: 32, max: 45, display: 'percent' } as const;
    expect(formatBarValue(bar, { withNumbers: true })).toBe('71% · 32 / 45');
  });

  it('a number bar read with the numbers stays "−4 / 38"', () => {
    const bar = { current: -4, max: 38, display: 'number' } as const;
    expect(formatBarValue(bar, { withNumbers: true })).toBe('−4 / 38');
  });
});

describe('bar colors', () => {
  it.each([
    ['gold', 'var(--chart-1)', 'Ouro'],
    ['steel', 'var(--chart-2)', 'Aço'],
    ['ember', 'var(--chart-3)', 'Brasa'],
    ['moss', 'var(--chart-4)', 'Musgo'],
    ['ash', 'var(--chart-5)', 'Cinza'],
  ] as const)('%s is %s, named %s', (color, cssVar, label) => {
    expect(barToneVar(color)).toBe(cssVar);
    expect(BAR_COLOR_LABEL[color]).toBe(label);
  });
});
