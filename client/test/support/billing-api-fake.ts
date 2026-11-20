import {
  BILLING_PRICE_KEYS,
  priceKeyPartsOf,
  type BillingAdminAccountDto,
  type BillingAdminCancelResponseDto,
  type BillingAdminSubscriptionDto,
  type BillingExportDto,
  type BillingPaymentDto,
  type BillingPriceDto,
  type BillingPriceKey,
  type BillingStatusDto,
  type BillingSubscriptionDto,
  type CheckoutRequestDto,
  type RefundRequestDto,
} from '@lorkarium/contracts';
import type { BillingApi, BillingResult } from '@/services/billing-api';
import { ScriptedAnswers } from './scripted-answers';

// The catalog of the billing service, in cents (the same numbers it keeps).
const CENTS: Readonly<Record<BillingPriceKey, number>> = {
  apoiador_monthly: 490,
  apoiador_semiannual: 2690,
  apoiador_annual: 4690,
  narrador_monthly: 1490,
  narrador_semiannual: 7990,
  narrador_annual: 14290,
  lenda_monthly: 2490,
  lenda_semiannual: 13390,
  lenda_annual: 23890,
};

/** One price of the catalog as `GET /api/billing/prices` answers it.
 *
 *  Example: `priceOf('lenda_annual').amountCents // 23890` */
export function priceOf(priceKey: BillingPriceKey): BillingPriceDto {
  return { priceKey, ...priceKeyPartsOf(priceKey), amountCents: CENTS[priceKey], currency: 'BRL' };
}

export const BILLING_PRICES: readonly BillingPriceDto[] = BILLING_PRICE_KEYS.map(priceOf);
export const NARRADOR_MONTHLY_PRICE = priceOf('narrador_monthly');

export const BILLING_STATUS_NONE: BillingStatusDto = {
  paidPlan: null,
  paidPlanUntil: null,
  periodEnd: null,
  subscription: null,
};

/** A card subscription of `priceKey` that renews until `currentPeriodEnd`. */
export function subscriptionOf(
  priceKey: BillingPriceKey,
  overrides: Partial<BillingSubscriptionDto> = {},
): BillingSubscriptionDto {
  return {
    priceKey,
    method: 'card',
    status: 'active',
    renews: true,
    currentPeriodEnd: '2026-12-16T15:00:00.000Z',
    ...overrides,
  };
}

/** A card subscription of the Narrador monthly as the backoffice sees it (with its id), renewing
 *  on 16/12/2026; `overrides` change any field.
 *
 *  Example: `adminSubscriptionOf({ status: 'cancelled', renews: false })` */
export function adminSubscriptionOf(
  overrides: Partial<BillingAdminSubscriptionDto> = {},
): BillingAdminSubscriptionDto {
  return {
    ...subscriptionOf('narrador_monthly'),
    id: '5e4d3c2b-1a09-4f8e-9d7c-6b5a4f3e2d1c',
    createdAt: '2026-11-16T15:00:00.000Z',
    ...overrides,
  };
}

/** An approved card payment of the Narrador monthly; `overrides` change any field. */
export function billingPaymentOf(overrides: Partial<BillingPaymentDto> = {}): BillingPaymentDto {
  return {
    id: '0b9a3c52-8f1e-4c1d-9a7b-6e5f4d3c2b1a',
    priceKey: 'narrador_monthly',
    method: 'card',
    amountCents: 1490,
    currency: 'BRL',
    status: 'approved',
    coversFrom: '2026-11-16T15:00:00.000Z',
    coversUntil: '2026-12-16T15:00:00.000Z',
    createdAt: '2026-11-16T15:00:00.000Z',
    ...overrides,
  };
}

/** Where the app was sent to pay, in order (`goToCheckout` of the app is `location.assign`). */
export class CheckoutNavigationFake {
  readonly visited: string[] = [];
  readonly goTo = (url: string): void => {
    this.visited.push(url);
  };
}

export const CHECKOUT_URL = 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=fake';

type Answers = {
  prices: BillingResult<readonly BillingPriceDto[]>;
  status: BillingResult<BillingStatusDto>;
  checkout: BillingResult<string>;
  cancel: BillingResult<BillingSubscriptionDto>;
  adminAccount: BillingResult<BillingAdminAccountDto>;
  refund: BillingResult<BillingPaymentDto>;
  adminCancel: BillingResult<BillingAdminCancelResponseDto>;
  exportOwn: BillingResult<BillingExportDto>;
};

/** The export of an account that never paid, as `GET /api/billing/export` answers it. */
export const BILLING_EXPORT_EMPTY: BillingExportDto = {
  exportedAt: '2026-11-19T14:30:00.000Z',
  subscriptions: [],
  payments: [],
};

/** A `BillingApi` in memory: the catalog, the session's `status`, a checkout that always opens the
 *  Mercado Pago and one admin account (whose renewing card subscription `adminCancel` stops);
 *  every method can be scripted (`answers`). */
export class BillingApiFake implements BillingApi {
  status_: BillingStatusDto = BILLING_STATUS_NONE;
  account: BillingAdminAccountDto = { ...BILLING_STATUS_NONE, subscriptions: [], payments: [] };
  readonly answers = new ScriptedAnswers<Answers>();

  prices(): Promise<Answers['prices']> {
    return this.answers.reply('prices', undefined, () => ({ ok: true, value: BILLING_PRICES }));
  }

  status(): Promise<Answers['status']> {
    return this.answers.reply('status', undefined, () => ({ ok: true, value: this.status_ }));
  }

  checkout(request: CheckoutRequestDto): Promise<Answers['checkout']> {
    return this.answers.reply('checkout', request, () => ({ ok: true, value: CHECKOUT_URL }));
  }

  cancel(): Promise<Answers['cancel']> {
    return this.answers.reply('cancel', undefined, () => this.cancelled());
  }

  adminAccount(userId: string): Promise<Answers['adminAccount']> {
    return this.answers.reply('adminAccount', userId, () => ({ ok: true, value: this.account }));
  }

  refund(request: RefundRequestDto, idempotencyKey: string): Promise<Answers['refund']> {
    return this.answers.reply('refund', { request, idempotencyKey }, () => this.refunded(request));
  }

  /** `exported` unless scripted. */
  exported: BillingExportDto = BILLING_EXPORT_EMPTY;

  exportOwn(): Promise<Answers['exportOwn']> {
    return this.answers.reply('exportOwn', undefined, () => ({ ok: true, value: this.exported }));
  }

  adminCancel(userId: string, idempotencyKey: string): Promise<Answers['adminCancel']> {
    return this.answers.reply('adminCancel', { userId, idempotencyKey }, () =>
      this.cancelledByAdmin(),
    );
  }

  private cancelledByAdmin(): Answers['adminCancel'] {
    const renewing = this.account.subscriptions.find(
      (each) => each.status === 'active' && each.renews,
    );
    if (renewing === undefined)
      return { ok: true, value: { subscription: null, cancelled: false } };
    const subscription = { ...renewing, status: 'cancelled', renews: false } as const;
    const subscriptions = this.account.subscriptions.map((each) =>
      each.id === renewing.id ? subscription : each,
    );
    this.account = { ...this.account, subscriptions };
    return { ok: true, value: { subscription, cancelled: true } };
  }

  private cancelled(): Answers['cancel'] {
    const current = this.status_.subscription;
    if (current === null)
      return { ok: false, failure: { kind: 'refused', code: 'NO_ACTIVE_SUBSCRIPTION' } };
    const subscription = { ...current, status: 'cancelled', renews: false } as const;
    this.status_ = { ...this.status_, subscription };
    return { ok: true, value: subscription };
  }

  private refunded(request: RefundRequestDto): Answers['refund'] {
    const payment = this.account.payments.find((each) => each.id === request.paymentId);
    if (payment === undefined)
      return { ok: false, failure: { kind: 'refused', code: 'PAYMENT_NOT_FOUND' } };
    const refunded = { ...payment, status: 'refunded' } as const;
    const payments = this.account.payments.map((each) =>
      each.id === payment.id ? refunded : each,
    );
    this.account = { ...this.account, payments };
    return { ok: true, value: refunded };
  }
}

/** The pauses between two checks of a payment: instant by default; `hold` keeps the next ones
 *  waiting until the returned function is called. */
export class BillingWaitsFake {
  private held: Promise<void> | null = null;

  readonly wait = (): Promise<void> => this.held ?? Promise.resolve();

  hold(): () => void {
    let release: () => void = () => undefined;
    this.held = new Promise<void>((resolve) => {
      release = () => {
        this.held = null;
        resolve();
      };
    });
    return release;
  }
}
