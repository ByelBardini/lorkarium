import { describe, expect, it } from 'vitest';
import { namesTable } from '@/services/table-event-scope';
import { QUELM, VHARN } from '../support/campaigns-api-fake';

describe('namesTable', () => {
  it('is true only for a payload naming that table', () => {
    expect(namesTable({ campaignId: VHARN.id, version: 3 }, VHARN.id)).toBe(true);
    expect(namesTable({ campaignId: QUELM.id }, VHARN.id)).toBe(false);
  });

  it.each([null, undefined, 'texto', 7, {}, { campaignId: 7 }])(
    'is false for a payload with no campaign id (%j)',
    (payload) => {
      expect(namesTable(payload, VHARN.id)).toBe(false);
    },
  );
});
