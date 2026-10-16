import { describe, expect, it } from 'vitest';
import { BAR_COLOR_LABEL, barFill, barToneVar, formatBarValue } from '@/lib/bar-display';

describe('barFill', () => {
  it('32 of 45 fills 71% and is normal', () => {
    const fill = barFill({ current: 32, max: 45 });
    expect(fill.state).toBe('normal');
    expect(fill.fraction).toBeCloseTo(0.711, 3);
  });

  it('0 is an empty normal bar', () => {
    expect(barFill({ current: 0, max: 10 })).toEqual({ fraction: 0, state: 'normal' });
  });

  it('a negative value is empty and negative', () => {
    expect(barFill({ current: -4, max: 38 })).toEqual({ fraction: 0, state: 'negative' });
  });

  it('above the maximum is full and over', () => {
    expect(barFill({ current: 50, max: 45 })).toEqual({ fraction: 1, state: 'over' });
  });
});

describe('formatBarValue', () => {
  it('reads "32 / 45"', () => {
    expect(formatBarValue({ current: 32, max: 45 })).toBe('32 / 45');
  });

  it('a negative value takes the typographic minus: "−4 / 38"', () => {
    expect(formatBarValue({ current: -4, max: 38 })).toBe('−4 / 38');
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
