import { describe, expect, it } from 'vitest';
import { sinceLabel } from '@/lib/since-label';

const NOW = new Date('2026-10-14T20:00:00.000Z');

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('sinceLabel', () => {
  it.each([
    [30_000, 'agora'],
    [MINUTE, 'há 1 min'],
    [59 * MINUTE, 'há 59 min'],
    [5 * HOUR, 'há 5 h'],
    [DAY, 'há 1 dia'],
    [2 * DAY + 3 * HOUR, 'há 2 dias'],
    [95 * DAY, 'há 3 meses'],
    [400 * DAY, 'há 1 ano'],
  ])('%i ms ago reads "%s"', (elapsed, label) => {
    expect(sinceLabel(ago(elapsed), NOW)).toBe(label);
  });

  it('an instant ahead of now (clocks apart) reads "agora"', () => {
    expect(sinceLabel(ago(-5 * MINUTE), NOW)).toBe('agora');
  });
});
