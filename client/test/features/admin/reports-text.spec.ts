import { describe, expect, it } from 'vitest';
import {
  reportMeasureDraft,
  reportPartyLabel,
  reportShotsLabel,
} from '@/features/admin/reports-text';

describe('reportMeasureDraft', () => {
  const id = '7e700000-0000-4000-8000-000000000003';

  it('a report of someone under 18 opens the age removal, tied to the report', () => {
    expect(reportMeasureDraft({ id, reason: 'underage' })).toEqual({
      kind: 'ban',
      rule: 'minimum_age',
      reportId: id,
    });
  });

  it('any other reason opens the measure only tied to the report', () => {
    expect(reportMeasureDraft({ id, reason: 'spam' })).toEqual({ reportId: id });
  });
});

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
