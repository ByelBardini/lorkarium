import { describe, expect, it } from 'vitest';
import { continueCandidate, filterCampaigns } from '@/lib/campaign-list';
import { QUELM, VHARN } from '../support/campaigns-api-fake';

const LIST = [VHARN, QUELM];

describe('filterCampaigns', () => {
  it('an empty or blank query keeps every campaign', () => {
    expect(filterCampaigns(LIST, '  ')).toEqual(LIST);
  });

  it('"vharn" finds "Os Sinos de Vharn" ignoring case', () => {
    expect(filterCampaigns(LIST, 'vharn')).toEqual([VHARN]);
  });

  it('"pantano" finds "Contrato no Pântano" ignoring the accent', () => {
    expect(filterCampaigns(LIST, 'pantano')).toEqual([QUELM]);
  });

  it('"tormenta" finds a campaign by its system', () => {
    expect(filterCampaigns(LIST, 'tormenta')).toEqual([QUELM]);
  });

  it('a query nobody matches gives an empty list', () => {
    expect(filterCampaigns(LIST, 'xyz')).toEqual([]);
  });
});

describe('continueCandidate', () => {
  it('is null when no campaign was ever entered', () => {
    expect(continueCandidate([{ ...VHARN, lastEnteredAt: null }, QUELM])).toBeNull();
  });

  it('picks the most recently entered campaign whatever the input order', () => {
    const older = { ...VHARN, lastEnteredAt: '2026-10-10T12:00:00.000Z' };
    const newer = { ...QUELM, lastEnteredAt: '2026-10-12T12:00:00.000Z' };
    expect(continueCandidate([older, newer])).toBe(newer);
    expect(continueCandidate([newer, older])).toBe(newer);
  });
});
