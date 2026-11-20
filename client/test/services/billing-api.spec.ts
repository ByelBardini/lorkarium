import { beforeEach, describe, expect, it } from 'vitest';
import { HttpBillingApi } from '@/services/billing-api';
import {
  BILLING_EXPORT_EMPTY,
  BILLING_STATUS_NONE,
  NARRADOR_MONTHLY_PRICE,
  adminSubscriptionOf,
  billingPaymentOf,
} from '../support/billing-api-fake';
import { HttpTransportFake } from '../support/http-transport-fake';

const PAYMENT_ID = '0b9a3c52-8f1e-4c1d-9a7b-6e5f4d3c2b1a';
const USER_ID = '7d1c2b3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const CHECKOUT_URL = 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=2c9';

describe('HttpBillingApi', () => {
  let transport: HttpTransportFake;
  let api: HttpBillingApi;

  beforeEach(() => {
    transport = new HttpTransportFake();
    api = new HttpBillingApi(transport);
  });

  it('prices reads GET /billing/prices and gives the catalog the server sent', async () => {
    transport.respondWith(200, { prices: [NARRADOR_MONTHLY_PRICE] });
    expect(await api.prices()).toEqual({ ok: true, value: [NARRADOR_MONTHLY_PRICE] });
    expect(transport.requests).toEqual([
      { method: 'GET', path: '/billing/prices', body: undefined },
    ]);
  });

  it('a price that is not whole cents is unexpected, never shown', async () => {
    transport.respondWith(200, { prices: [{ ...NARRADOR_MONTHLY_PRICE, amountCents: 14.9 }] });
    expect(await api.prices()).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });

  it('checkout posts only the key and the method and gives the redirect', async () => {
    transport.respondWith(200, { redirectUrl: CHECKOUT_URL });

    const result = await api.checkout({ priceKey: 'narrador_monthly', method: 'card' });

    expect(result).toEqual({ ok: true, value: CHECKOUT_URL });
    expect(transport.requests).toEqual([
      {
        method: 'POST',
        path: '/billing/checkout',
        body: { priceKey: 'narrador_monthly', method: 'card' },
      },
    ]);
  });

  it('a redirect outside the Mercado Pago is refused as unexpected', async () => {
    transport.respondWith(200, { redirectUrl: 'https://evil.example/pay' });
    const result = await api.checkout({ priceKey: 'lenda_annual', method: 'pix' });
    expect(result).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });

  it('a 429 on checkout becomes the wait the server asks for', async () => {
    transport.respondWith(429, { code: 'RATE_LIMITED', message: 'x', retryAfterSeconds: 42 });
    const result = await api.checkout({ priceKey: 'lenda_annual', method: 'pix' });
    expect(result).toEqual({ ok: false, failure: { kind: 'rate_limited', retryAfterSeconds: 42 } });
  });

  it('a refusal of the billing service keeps its code', async () => {
    transport.respondWith(409, { code: 'ALREADY_SUBSCRIBED', message: 'x' });
    const result = await api.checkout({ priceKey: 'narrador_monthly', method: 'card' });
    expect(result).toEqual({ ok: false, failure: { kind: 'refused', code: 'ALREADY_SUBSCRIBED' } });
  });

  it('a refusal with a code outside the billing list keeps no code', async () => {
    transport.respondWith(502, { code: 'SOMETHING', message: 'x' });
    const result = await api.status();
    expect(result).toEqual({ ok: false, failure: { kind: 'refused', code: null } });
  });

  it('status offline fails as offline', async () => {
    transport.failWithNetworkDown();
    expect(await api.status()).toEqual({ ok: false, failure: { kind: 'offline' } });
  });

  it('status reads GET /billing/status', async () => {
    transport.respondWith(200, BILLING_STATUS_NONE);
    expect(await api.status()).toEqual({ ok: true, value: BILLING_STATUS_NONE });
  });

  it('cancel posts to /billing/cancel and gives the subscription that no longer renews', async () => {
    const subscription = {
      priceKey: 'narrador_monthly',
      method: 'card',
      status: 'cancelled',
      renews: false,
      currentPeriodEnd: '2026-12-16T12:00:00.000Z',
    } as const;
    transport.respondWith(200, { subscription });
    expect(await api.cancel()).toEqual({ ok: true, value: subscription });
    expect(transport.requests[0]).toMatchObject({ method: 'POST', path: '/billing/cancel' });
  });

  it('refund sends the reason and the idempotency key of this attempt', async () => {
    const payment = billingPaymentOf({ id: PAYMENT_ID, status: 'refunded' });
    transport.respondWith(200, { payment });

    const result = await api.refund(
      { paymentId: PAYMENT_ID, reason: 'Arrependimento em 7 dias' },
      'key-1',
    );

    expect(result).toEqual({ ok: true, value: payment });
    expect(transport.requests[0]).toEqual({
      method: 'POST',
      path: '/billing/admin/refunds',
      body: { paymentId: PAYMENT_ID, reason: 'Arrependimento em 7 dias' },
      headers: { 'x-idempotency-key': 'key-1' },
    });
  });

  it('adminCancel posts to the cancel of that account with the idempotency key of this attempt', async () => {
    const subscription = adminSubscriptionOf({ status: 'cancelled', renews: false });
    transport.respondWith(200, { subscription, cancelled: true });

    const result = await api.adminCancel(USER_ID, 'key-7');

    expect(result).toEqual({ ok: true, value: { subscription, cancelled: true } });
    expect(transport.requests).toEqual([
      {
        method: 'POST',
        path: `/billing/admin/accounts/${USER_ID}/cancel`,
        body: undefined,
        headers: { 'x-idempotency-key': 'key-7' },
      },
    ]);
  });

  it('adminCancel refused for the admin without 2FA keeps TWO_FACTOR_REQUIRED', async () => {
    transport.respondWith(403, { code: 'TWO_FACTOR_REQUIRED', message: 'x' });
    const result = await api.adminCancel(USER_ID, 'key-7');
    expect(result).toEqual({
      ok: false,
      failure: { kind: 'refused', code: 'TWO_FACTOR_REQUIRED' },
    });
  });

  it('adminCancel with a body outside the contract is unexpected', async () => {
    transport.respondWith(200, { subscription: null });
    const result = await api.adminCancel(USER_ID, 'key-7');
    expect(result).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });

  it('the billing of an account is read by its id, for the backoffice', async () => {
    const account = { paidPlan: null, paidPlanUntil: null, subscriptions: [], payments: [] };
    transport.respondWith(200, account);
    expect(await api.adminAccount(PAYMENT_ID)).toEqual({ ok: true, value: account });
    expect(transport.requests[0]?.path).toBe(`/billing/admin/accounts/${PAYMENT_ID}`);
  });

  it('exportOwn reads GET /billing/export and gives the export the service sent', async () => {
    transport.respondWith(200, BILLING_EXPORT_EMPTY);

    expect(await api.exportOwn()).toEqual({ ok: true, value: BILLING_EXPORT_EMPTY });
    expect(transport.requests).toEqual([
      { method: 'GET', path: '/billing/export', body: undefined },
    ]);
  });

  it('an export with a field outside the contract is unexpected', async () => {
    transport.respondWith(200, { ...BILLING_EXPORT_EMPTY, preapprovals: [] });

    expect(await api.exportOwn()).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });
});
