import { describe, expect, it } from 'vitest';
import { editedLabel } from '@/lib/edited-label';

// Wednesday, 14 October 2026, 20:00 local time.
const NOW = new Date(2026, 9, 14, 20, 0);

function daysAgo(days: number, hour = 10): string {
  return new Date(2026, 9, 14 - days, hour, 0).toISOString();
}

describe('editedLabel', () => {
  it('earlier on the same day is "hoje", and so is an instant ahead of the clock', () => {
    expect(editedLabel(daysAgo(0, 0), NOW)).toBe('editado hoje');
    expect(editedLabel(new Date(2026, 9, 23).toISOString(), NOW)).toBe('editado hoje');
  });

  it('counts calendar days, not 24 hours: last night is "ontem"', () => {
    expect(editedLabel(daysAgo(1, 23), NOW)).toBe('editado ontem');
  });

  it('days, then weeks, months and years, singular and plural', () => {
    expect(editedLabel(daysAgo(3), NOW)).toBe('editado há 3 dias');
    expect(editedLabel(daysAgo(7), NOW)).toBe('editado há 1 semana');
    expect(editedLabel(daysAgo(20), NOW)).toBe('editado há 2 semanas');
    expect(editedLabel(daysAgo(30), NOW)).toBe('editado há 1 mês');
    expect(editedLabel(daysAgo(200), NOW)).toBe('editado há 6 meses');
    expect(editedLabel(daysAgo(800), NOW)).toBe('editado há 2 anos');
  });
});
