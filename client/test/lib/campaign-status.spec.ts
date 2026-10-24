import { describe, expect, it } from 'vitest';
import { CAMPAIGN_STATUSES, CAMPAIGN_STATUS_LABEL, statusToneClass } from '@/lib/campaign-status';

describe('campaign status', () => {
  it.each([
    ['building', 'Em construção'],
    ['recruiting', 'Recrutando'],
    ['ongoing', 'Em andamento'],
    ['finished', 'Finalizada'],
  ] as const)('%s reads "%s"', (status, label) => {
    expect(CAMPAIGN_STATUS_LABEL[status]).toBe(label);
  });

  it('a form offers the four statuses starting at "Em construção"', () => {
    expect(CAMPAIGN_STATUSES).toEqual(['building', 'recruiting', 'ongoing', 'finished']);
  });

  it.each([
    ['building', 'text-chart-2'],
    ['recruiting', 'text-chart-4'],
    ['ongoing', 'text-primary'],
    ['finished', 'text-muted-foreground'],
  ] as const)('%s is colored by the %s token', (status, tone) => {
    expect(statusToneClass(status)).toBe(tone);
  });
});
