import { describe, expect, it } from 'vitest';
import { dayOf, paidPlanLine } from '@/lib/paid-plan-text';

describe('paidPlanLine', () => {
  it('names the paid plan and the day it holds until', () => {
    expect(paidPlanLine('lenda', '2026-12-16T15:00:00.000Z')).toBe('Lenda até 16/12/2026');
  });

  it('says nothing without a paid plan', () => {
    expect(paidPlanLine(null, null)).toBeNull();
  });
});

describe('dayOf', () => {
  it('writes an instant as the local day', () => {
    expect(dayOf('2026-12-16T15:00:00.000Z')).toBe('16/12/2026');
  });
});
