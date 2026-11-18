import { describe, expect, it } from 'vitest';
import { bestSavingPercentOf, offerPriceOf } from '@/features/billing/offer-price';
import { BILLING_PRICES } from '../../support/billing-api-fake';

describe('offerPriceOf', () => {
  const prices = BILLING_PRICES;

  it('annual: the month it comes to, split for the numeral, the monthly struck and the saving', () => {
    expect(offerPriceOf(prices, 'narrador', 'annual', 'card')).toEqual({
      priceKey: 'narrador_annual',
      months: 12,
      totalCents: 14290,
      fullCents: 17880,
      savingPercent: 20,
      reais: '11',
      cents: ',91',
      was: 'R$ 14,90/mês',
      billed: 'R$ 142,90 por ano',
      saving: 'R$ 35,90',
    });
  });

  it('monthly by Pix is one month paid at once, nothing struck nor saved', () => {
    expect(offerPriceOf(prices, 'lenda', 'monthly', 'pix')).toMatchObject({
      reais: '24',
      cents: ',90',
      was: null,
      billed: 'Pago de uma vez, vale 1 mês',
      saving: null,
      fullCents: 2490,
      savingPercent: 0,
    });
  });

  it('a plan missing from the catalog has no offer', () => {
    expect(offerPriceOf([], 'lenda', 'monthly', 'card')).toBeNull();
  });
});

describe('bestSavingPercentOf', () => {
  it('is the biggest whole-percent discount of the period in the catalog', () => {
    expect(bestSavingPercentOf(BILLING_PRICES, 'annual')).toBe(20);
    expect(bestSavingPercentOf(BILLING_PRICES, 'semiannual')).toBe(10);
    expect(bestSavingPercentOf(BILLING_PRICES, 'monthly')).toBe(0);
  });
});
