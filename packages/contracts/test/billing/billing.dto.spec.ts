import { describe, expect, it } from 'vitest';
import {
  BILLING_CHECKOUT_HOSTS,
  BILLING_PRICE_KEYS,
  billingPricesResponseDto,
  billingStatusDto,
  checkoutRequestDto,
  checkoutResponseDto,
  priceKeyPartsOf,
  refundRequestDto,
} from '../../src/billing/billing.dto';

const PAYMENT_ID = '0b9a3c52-8f1e-4c1d-9a7b-6e5f4d3c2b1a';

function messagesOf(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message).join(' | ') ?? '';
}

describe('BILLING_PRICE_KEYS', () => {
  it('has the nine prices: three plans in three periods', () => {
    expect(BILLING_PRICE_KEYS).toHaveLength(9);
    expect(BILLING_PRICE_KEYS).toContain('narrador_monthly');
    expect(BILLING_PRICE_KEYS).toContain('apoiador_semiannual');
    expect(BILLING_PRICE_KEYS).toContain('lenda_annual');
  });

  it('priceKeyPartsOf splits a key into its plan and months', () => {
    expect(priceKeyPartsOf('lenda_annual')).toEqual({
      plan: 'lenda',
      period: 'annual',
      months: 12,
    });
    expect(priceKeyPartsOf('apoiador_semiannual')).toMatchObject({ months: 6 });
  });
});

describe('checkoutRequestDto', () => {
  it('accepts a price of the catalog paid by card', () => {
    expect(checkoutRequestDto.parse({ priceKey: 'narrador_monthly', method: 'card' })).toEqual({
      priceKey: 'narrador_monthly',
      method: 'card',
    });
  });

  it('refuses a price outside the catalog, citing the value', () => {
    const result = checkoutRequestDto.safeParse({ priceKey: 'narrador_weekly', method: 'card' });
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('"narrador_weekly"');
  });

  it('refuses an amount sent by the client (strict object)', () => {
    const result = checkoutRequestDto.safeParse({
      priceKey: 'narrador_monthly',
      method: 'pix',
      amount: 1,
    });
    expect(result.success).toBe(false);
  });

  it('refuses a method other than card or pix', () => {
    expect(
      checkoutRequestDto.safeParse({ priceKey: 'lenda_annual', method: 'boleto' }).success,
    ).toBe(false);
  });
});

describe('checkoutResponseDto', () => {
  it('accepts a redirect to the checkout of the Mercado Pago', () => {
    const redirectUrl = 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=2c9';
    expect(checkoutResponseDto.parse({ redirectUrl }).redirectUrl).toBe(redirectUrl);
  });

  it('refuses a redirect to another host, citing the host and the allowed ones', () => {
    const result = checkoutResponseDto.safeParse({ redirectUrl: 'https://evil.example/pay' });
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('evil.example');
    expect(messagesOf(result)).toContain(BILLING_CHECKOUT_HOSTS[0]);
  });

  it('refuses an allowed host hidden as the userinfo of another', () => {
    const redirectUrl = 'https://www.mercadopago.com.br@evil.example/pay';
    expect(checkoutResponseDto.safeParse({ redirectUrl }).success).toBe(false);
  });

  it('refuses a plain http redirect even to an allowed host', () => {
    const result = checkoutResponseDto.safeParse({
      redirectUrl: 'http://www.mercadopago.com.br/checkout',
    });
    expect(result.success).toBe(false);
  });
});

describe('refundRequestDto', () => {
  it('accepts a payment and a reason of ten characters or more', () => {
    const body = { paymentId: PAYMENT_ID, reason: 'Arrependimento em 7 dias (CDC art. 49)' };
    expect(refundRequestDto.parse(body)).toEqual(body);
  });

  it('refuses a reason shorter than 10 characters', () => {
    const result = refundRequestDto.safeParse({ paymentId: PAYMENT_ID, reason: 'pedido' });
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('10');
  });
});

describe('billingPricesResponseDto', () => {
  it('accepts a price in cents with its plan and months', () => {
    const body = {
      prices: [
        {
          priceKey: 'narrador_monthly',
          plan: 'narrador',
          period: 'monthly',
          months: 1,
          amountCents: 1490,
          currency: 'BRL',
        },
      ],
    };
    expect(billingPricesResponseDto.parse(body)).toEqual(body);
  });

  it('refuses an amount that is not whole cents', () => {
    const price = {
      priceKey: 'narrador_monthly',
      plan: 'narrador',
      period: 'monthly',
      months: 1,
      amountCents: 14.9,
      currency: 'BRL',
    };
    expect(billingPricesResponseDto.safeParse({ prices: [price] }).success).toBe(false);
  });
});

describe('billingStatusDto', () => {
  it('accepts an account without a paid plan nor a subscription', () => {
    const body = { paidPlan: null, paidPlanUntil: null, periodEnd: null, subscription: null };
    expect(billingStatusDto.parse(body)).toEqual(body);
  });

  it('accepts a card subscription that renews', () => {
    const body = {
      paidPlan: 'lenda',
      paidPlanUntil: '2026-12-23T12:00:00.000Z',
      periodEnd: '2026-12-16T12:00:00.000Z',
      subscription: {
        priceKey: 'lenda_monthly',
        method: 'card',
        status: 'active',
        renews: true,
        currentPeriodEnd: '2026-12-16T12:00:00.000Z',
      },
    };
    expect(billingStatusDto.parse(body)).toEqual(body);
  });

  it('refuses a paid plan without its end, citing the field', () => {
    const result = billingStatusDto.safeParse({
      paidPlan: 'narrador',
      paidPlanUntil: null,
      periodEnd: null,
      subscription: null,
    });
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('paidPlanUntil');
  });
});
