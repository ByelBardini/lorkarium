import { describe, expect, it } from 'vitest';
import { bestSavingPercent, brl, priceView } from '@/lib/plan-price';

const NARRADOR = { mensal: 1490, semestral: 7990, anual: 14290 };
const APOIADOR = { mensal: 490, semestral: 2690, anual: 4690 };

describe('brl', () => {
  it('writes cents as reais with a comma', () => {
    expect(brl(1490)).toBe('R$ 14,90');
    expect(brl(23890)).toBe('R$ 238,90');
  });
});

describe('priceView', () => {
  it('monthly: the price itself per month, charged every month, no saving', () => {
    expect(priceView(NARRADOR, 'mensal')).toEqual({
      reais: '14',
      cents: ',90',
      was: null,
      billed: 'Cobrado todo mês',
      saving: null,
    });
  });

  it('annual: the month it comes to, the monthly price struck, the total and the saving', () => {
    expect(priceView(NARRADOR, 'anual')).toEqual({
      reais: '11',
      cents: ',91',
      was: 'R$ 14,90/mês',
      billed: 'R$ 142,90 por ano',
      saving: 'R$ 35,90',
    });
  });

  it('semiannual: every 6 months, rounded to the cent per month', () => {
    expect(priceView(NARRADOR, 'semestral')).toMatchObject({
      reais: '13',
      cents: ',32',
      billed: 'R$ 79,90 a cada 6 meses',
      saving: 'R$ 9,50',
    });
  });
});

describe('bestSavingPercent', () => {
  it('is the biggest whole-percent discount of the period among the plans', () => {
    expect(bestSavingPercent([NARRADOR, APOIADOR], 'anual')).toBe(20);
    expect(bestSavingPercent([NARRADOR, APOIADOR], 'semestral')).toBe(10);
    expect(bestSavingPercent([NARRADOR, APOIADOR], 'mensal')).toBe(0);
  });
});
