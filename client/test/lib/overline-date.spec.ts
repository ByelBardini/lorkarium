import { describe, expect, it } from 'vitest';
import { formatOverlineDate } from '@/lib/overline-date';

describe('formatOverlineDate', () => {
  it.each([
    [new Date(2026, 9, 14), 'Quarta, 14 de outubro'],
    [new Date(2026, 9, 17), 'Sábado, 17 de outubro'],
    [new Date(2026, 9, 18), 'Domingo, 18 de outubro'],
    [new Date(2026, 0, 5), 'Segunda, 5 de janeiro'],
  ])('%s reads as "%s"', (date, expected) => {
    expect(formatOverlineDate(date)).toBe(expected);
  });
});
