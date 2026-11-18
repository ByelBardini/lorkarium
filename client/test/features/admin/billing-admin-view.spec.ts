import type { BillingAdminSubscriptionDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  paymentStatusViewOf,
  paymentTotalsOf,
  renewalOf,
  splitPayments,
  splitSubscriptions,
  subscriptionStatusViewOf,
} from '@/features/admin/billing-admin-view';
import { billingPaymentOf, subscriptionOf } from '../../support/billing-api-fake';

function adminSubscription(
  overrides: Partial<BillingAdminSubscriptionDto>,
): BillingAdminSubscriptionDto {
  return {
    ...subscriptionOf('narrador_annual'),
    id: crypto.randomUUID(),
    createdAt: '2026-11-16T15:00:00.000Z',
    ...overrides,
  };
}

describe('paymentStatusViewOf', () => {
  it.each([
    ['approved', 'Pago', 'success'],
    ['pending', 'Pendente', 'waiting'],
    ['rejected', 'Recusado', 'problem'],
    ['charged_back', 'Contestado', 'problem'],
    ['refunded', 'Reembolsado', 'past'],
    ['cancelled', 'Cancelado', 'past'],
  ] as const)('%s reads %s in the %s tone', (status, label, tone) => {
    expect(paymentStatusViewOf(status)).toEqual({ label, tone });
  });
});

describe('subscriptionStatusViewOf', () => {
  it.each([
    [{ status: 'pending', renews: true }, 'Não concluída'],
    [{ status: 'active', renews: true }, 'Renova'],
    [{ status: 'active', renews: false }, 'Cancelada'],
    [{ status: 'cancelled', renews: false }, 'Cancelada'],
    [{ status: 'ended', renews: false }, 'Encerrada'],
  ] as const)('%o reads %s', (subscription, label) => {
    expect(subscriptionStatusViewOf(subscription).label).toBe(label);
  });
});

describe('splitPayments', () => {
  it('keeps what moved money apart from Pix never paid and checkouts left, newest first', () => {
    const old = billingPaymentOf({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' });
    const recent = billingPaymentOf({ id: 'b', status: 'refunded' });
    const left = billingPaymentOf({ id: 'c', status: 'cancelled' });
    const waiting = billingPaymentOf({ id: 'd', status: 'pending' });

    const split = splitPayments([old, left, recent, waiting]);

    expect(split.main.map((payment) => payment.id)).toEqual(['b', 'a']);
    expect(split.attempts.map((payment) => payment.id).sort()).toEqual(['c', 'd']);
  });
});

describe('splitSubscriptions', () => {
  it('folds the subscriptions that never got a first charge', () => {
    const paid = adminSubscription({ status: 'cancelled', renews: false });
    const left = adminSubscription({ status: 'pending' });

    expect(splitSubscriptions([left, paid])).toEqual({ main: [paid], attempts: [left] });
  });
});

describe('paymentTotalsOf', () => {
  it('sums the approved as received and the refunded apart', () => {
    const totals = paymentTotalsOf([
      billingPaymentOf({ amountCents: 14290 }),
      billingPaymentOf({ amountCents: 1490, status: 'refunded' }),
      billingPaymentOf({ amountCents: 23890, status: 'cancelled' }),
    ]);

    expect(totals).toEqual({ receivedCents: 14290, refundedCents: 1490 });
  });
});

describe('renewalOf', () => {
  it('reads the newest subscription that got charged, skipping the attempts', () => {
    const subscriptions = [
      adminSubscription({ status: 'pending', createdAt: '2026-11-17T00:00:00.000Z' }),
      adminSubscription({ status: 'cancelled', renews: false }),
    ];

    expect(renewalOf(subscriptions)).toEqual({
      headline: 'Cancelada',
      detail: 'vale até 16/12/2026',
    });
  });

  it('says when it renews, and that there is none', () => {
    expect(renewalOf([adminSubscription({})])).toEqual({
      headline: 'Renova',
      detail: 'em 16/12/2026',
    });
    expect(renewalOf([])).toEqual({ headline: 'Sem assinatura', detail: null });
  });
});
