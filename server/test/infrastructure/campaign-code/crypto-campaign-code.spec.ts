import { campaignCodeDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { CryptoCampaignCode } from '../../../src/infrastructure/campaign-code/crypto-campaign-code';
import { IndexSourceFake } from '../../support/campaigns-fakes';

describe('CryptoCampaignCode', () => {
  it('maps the indexes 0 to 7 to the first eight symbols of the alphabet', () => {
    const codes = new CryptoCampaignCode(new IndexSourceFake([0, 1, 2, 3, 4, 5, 6, 7]).next);
    expect(codes.generate()).toBe('23456789');
  });

  it('with the real random source, 50 codes have 8 symbols of the alphabet and pass the DTO', () => {
    const codes = new CryptoCampaignCode();
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const code = codes.generate();
      expect(code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
      expect(campaignCodeDto.parse(code)).toBe(code);
    }
  });

  it('asks the source for indexes below the alphabet size, once per symbol', () => {
    const source = new IndexSourceFake([31]);
    const code = new CryptoCampaignCode(source.next).generate();
    expect(source.bounds).toEqual([32, 32, 32, 32, 32, 32, 32, 32]);
    expect(code).toBe('ZZZZZZZZ');
  });
});
