import { describe, expect, it } from 'vitest';
import { subscriptionLine } from '@/features/billing/subscription-line';
import { subscriptionOf } from '../../support/billing-api-fake';

describe('subscriptionLine', () => {
  it('a card subscription that renews says the plan, the period and the next charge', () => {
    expect(subscriptionLine(subscriptionOf('lenda_annual'))).toBe(
      'Lenda anual no cartão, renova em 16/12/2026',
    );
  });

  it('one waiting for its first charge says so', () => {
    const pending = subscriptionOf('narrador_monthly', {
      status: 'pending',
      currentPeriodEnd: null,
    });
    expect(subscriptionLine(pending)).toBe(
      'Narrador mensal no cartão, aguardando a primeira cobrança',
    );
  });

  it('a cancelled renewal says until when the plan holds', () => {
    const cancelled = subscriptionOf('narrador_monthly', { status: 'cancelled', renews: false });
    expect(subscriptionLine(cancelled)).toBe(
      'Renovação cancelada: o Narrador vale até 16/12/2026.',
    );
  });
});
