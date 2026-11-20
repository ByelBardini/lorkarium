import { describe, expect, it } from 'vitest';
import { reportPartyLabel, reportShotsLabel } from '@/features/admin/reports-text';

describe('reportPartyLabel', () => {
  it('a living account is its @', () => {
    expect(reportPartyLabel({ id: '9c3f2e4a-5d6f-4a7b-8c9d-2e3f4a5b6c7d', username: 'caio' })).toBe(
      '@caio',
    );
  });

  it('a deleted account is its @ of the time with "(excluído)"', () => {
    expect(reportPartyLabel({ id: null, username: 'caio' })).toBe('@caio (excluído)');
  });
});

describe('reportShotsLabel', () => {
  it.each([
    [0, 'Sem prints'],
    [1, '1 print'],
    [5, '5 prints'],
  ])('%i screenshots read "%s"', (count, label) => {
    expect(reportShotsLabel(count)).toBe(label);
  });
});
