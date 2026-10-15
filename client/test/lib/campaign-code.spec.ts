import { describe, expect, it } from 'vitest';
import { formatCampaignCode, maskCampaignCode } from '@/lib/campaign-code';

describe('formatCampaignCode', () => {
  it('splits the canonical code in two groups of four', () => {
    expect(formatCampaignCode('VHRN7K2Q')).toBe('VHRN-7K2Q');
  });

  it('a code of the wrong length is an error citing the value', () => {
    expect(() => formatCampaignCode('VHRN7K2')).toThrow('VHRN7K2');
  });
});

describe('maskCampaignCode', () => {
  it.each([
    ['vhrn', 'VHRN'],
    ['vhrn7', 'VHRN-7'],
    ['vhrn7k2q', 'VHRN-7K2Q'],
    ['VHRN-7K2Q', 'VHRN-7K2Q'],
    [' vh rn-7k 2q ', 'VHRN-7K2Q'],
    ['12313521321', '1231-3521'],
    ['VHRN-', 'VHRN'],
    ['', ''],
  ])('"%s" is shown as "%s"', (typed, shown) => {
    expect(maskCampaignCode(typed)).toBe(shown);
  });
});
