import { z } from 'zod';
import { checkPaidPlanPair, paidPlanFields } from '../plans/paid-plan.dto';

/** The plans on sale. The amigo_do_dono is a courtesy of the admin and never sold. */
export const BILLING_PLANS = ['apoiador', 'narrador', 'lenda'] as const;
export type BillingPlan = (typeof BILLING_PLANS)[number];

/** How long one payment covers, in months. */
export const BILLING_PERIOD_MONTHS = { monthly: 1, semiannual: 6, annual: 12 } as const;
export type BillingPeriod = keyof typeof BILLING_PERIOD_MONTHS;
const BILLING_PERIODS = Object.keys(BILLING_PERIOD_MONTHS) as BillingPeriod[];

/** The nine keys of the catalog. The amount lives only in the billing service: the client sends
 *  the key and shows what `GET /api/billing/prices` answers. */
export const BILLING_PRICE_KEYS = [
  'apoiador_monthly',
  'apoiador_semiannual',
  'apoiador_annual',
  'narrador_monthly',
  'narrador_semiannual',
  'narrador_annual',
  'lenda_monthly',
  'lenda_semiannual',
  'lenda_annual',
] as const satisfies readonly `${BillingPlan}_${BillingPeriod}`[];
export type BillingPriceKey = (typeof BILLING_PRICE_KEYS)[number];

export const billingPriceKeyDto = z.enum(BILLING_PRICE_KEYS, {
  error: (issue) =>
    `price ${JSON.stringify(issue.input)}: expected one of ${BILLING_PRICE_KEYS.join(', ')}`,
});

/** The plan, period and months of a key of the catalog.
 *
 *  Example: `priceKeyPartsOf('lenda_annual') // { plan: 'lenda', period: 'annual', months: 12 }` */
export function priceKeyPartsOf(priceKey: BillingPriceKey): {
  plan: BillingPlan;
  period: BillingPeriod;
  months: number;
} {
  const [plan, period] = priceKey.split('_') as [BillingPlan, BillingPeriod];
  return { plan, period, months: BILLING_PERIOD_MONTHS[period] };
}

export const BILLING_METHODS = ['card', 'pix'] as const;
export type BillingMethod = (typeof BILLING_METHODS)[number];
export const billingMethodDto = z.enum(BILLING_METHODS, {
  error: (issue) => `method ${JSON.stringify(issue.input)}: expected card or pix`,
});

/** One price of the catalog, in whole cents of BRL. */
export const billingPriceDto = z.strictObject({
  priceKey: billingPriceKeyDto,
  plan: z.enum(BILLING_PLANS),
  period: z.enum(BILLING_PERIODS),
  months: z.number().int().positive(),
  amountCents: z.number().int().positive(),
  currency: z.literal('BRL'),
});
export type BillingPriceDto = z.infer<typeof billingPriceDto>;

/** Response of `GET /api/billing/prices` (public).
 *
 *  Example: `billingPricesResponseDto.parse(body).prices[0].amountCents // 490` */
export const billingPricesResponseDto = z.strictObject({ prices: z.array(billingPriceDto) });
export type BillingPricesResponseDto = z.infer<typeof billingPricesResponseDto>;

/** Body of `POST /api/billing/checkout`: only the key and the method; the account comes from the
 *  session and the amount from the catalog.
 *
 *  Example: `checkoutRequestDto.parse({ priceKey: 'narrador_monthly', method: 'card' })` */
export const checkoutRequestDto = z.strictObject({
  priceKey: billingPriceKeyDto,
  method: billingMethodDto,
});
export type CheckoutRequestDto = z.infer<typeof checkoutRequestDto>;

/** The only hosts a checkout may send the browser to (the hosted page of the Mercado Pago). */
export const BILLING_CHECKOUT_HOSTS = [
  'www.mercadopago.com.br',
  'mercadopago.com.br',
  'sandbox.mercadopago.com.br',
] as const;

// Scheme and authority of an absolute URL; contracts has no `URL` global (zod only).
const URL_ORIGIN = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)/i;

function checkoutHostRefusal(raw: string): string | null {
  const [, scheme = '', authority = ''] = URL_ORIGIN.exec(raw) ?? [];
  // A userinfo (`https://www.mercadopago.com.br@evil.example`) would hide the real host.
  const host = authority.includes('@') ? authority : authority.replace(/:\d+$/, '').toLowerCase();
  const allowed = (BILLING_CHECKOUT_HOSTS as readonly string[]).includes(host);
  if (scheme.toLowerCase() === 'https' && allowed) return null;
  return `redirect ${scheme}://${host}: expected https on ${BILLING_CHECKOUT_HOSTS.join(', ')}`;
}

/** Response of `POST /api/billing/checkout`: where to send the browser. The client checks the host
 *  again before navigating, so a compromised answer never leads anywhere else.
 *
 *  Example: `location.assign(checkoutResponseDto.parse(body).redirectUrl)` */
export const checkoutResponseDto = z.strictObject({
  redirectUrl: z.url().check((ctx) => {
    const refusal = checkoutHostRefusal(ctx.value);
    if (refusal !== null) ctx.issues.push({ code: 'custom', message: refusal, input: ctx.value });
  }),
});
export type CheckoutResponseDto = z.infer<typeof checkoutResponseDto>;

export const BILLING_SUBSCRIPTION_STATUSES = ['pending', 'active', 'cancelled', 'ended'] as const;

/** The card subscription of the account as the account sees it; `renews` false once cancelled
 *  (the plan stays until `currentPeriodEnd`). */
export const billingSubscriptionDto = z.strictObject({
  priceKey: billingPriceKeyDto,
  method: billingMethodDto,
  status: z.enum(BILLING_SUBSCRIPTION_STATUSES),
  renews: z.boolean(),
  currentPeriodEnd: z.iso.datetime().nullable(),
});
export type BillingSubscriptionDto = z.infer<typeof billingSubscriptionDto>;

/** Response of `GET /api/billing/status`: the paid plan in force, until when it holds (grace
 *  included), the end of the paid period itself (past it and before `paidPlanUntil` = grace), and
 *  the subscription that renews it, if any.
 *
 *  Example: `billingStatusDto.parse(body).paidPlan // 'lenda'` */
export const billingStatusDto = z
  .strictObject({
    ...paidPlanFields,
    periodEnd: z.iso.datetime().nullable(),
    subscription: billingSubscriptionDto.nullable(),
  })
  .check(checkPaidPlanPair);
export type BillingStatusDto = z.infer<typeof billingStatusDto>;

/** Response of `POST /api/billing/cancel`: the subscription, no longer renewing. */
export const cancelSubscriptionResponseDto = z.strictObject({
  subscription: billingSubscriptionDto,
});
export type CancelSubscriptionResponseDto = z.infer<typeof cancelSubscriptionResponseDto>;

export const BILLING_PAYMENT_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'refunded',
  'charged_back',
] as const;

/** A payment as the backoffice sees it. */
export const billingPaymentDto = z.strictObject({
  id: z.uuid(),
  priceKey: billingPriceKeyDto,
  method: billingMethodDto,
  amountCents: z.number().int().positive(),
  currency: z.literal('BRL'),
  status: z.enum(BILLING_PAYMENT_STATUSES),
  coversFrom: z.iso.datetime().nullable(),
  coversUntil: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type BillingPaymentDto = z.infer<typeof billingPaymentDto>;

/** A subscription as the backoffice sees it. */
export const billingAdminSubscriptionDto = billingSubscriptionDto.extend({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
});
export type BillingAdminSubscriptionDto = z.infer<typeof billingAdminSubscriptionDto>;

/** Response of `GET /api/billing/admin/accounts/:userId` (admin only). */
export const billingAdminAccountDto = z.strictObject({
  ...paidPlanFields,
  subscriptions: z.array(billingAdminSubscriptionDto),
  payments: z.array(billingPaymentDto),
});
export type BillingAdminAccountDto = z.infer<typeof billingAdminAccountDto>;

/** Response of `POST /api/billing/admin/accounts/:userId/cancel` (admin with 2FA on, plus the
 *  `X-Idempotency-Key` header): the card renewal of another account stopped before it is deleted.
 *  An account with nothing to cancel answers `{ subscription: null, cancelled: false }`, not an
 *  error.
 *
 *  Example: `billingAdminCancelResponseDto.parse(body).cancelled // true` */
export const billingAdminCancelResponseDto = z.strictObject({
  subscription: billingAdminSubscriptionDto.nullable(),
  cancelled: z.boolean(),
});
export type BillingAdminCancelResponseDto = z.infer<typeof billingAdminCancelResponseDto>;

export const REFUND_REASON_MIN_LENGTH = 10;
export const REFUND_REASON_MAX_LENGTH = 500;

/** Body of `POST /api/billing/admin/refunds` (admin with 2FA on): the whole payment back, with a
 *  written reason that goes to the audit log. The `X-Idempotency-Key` header makes a retry safe.
 *
 *  Example: `refundRequestDto.parse({ paymentId, reason: 'Arrependimento em 7 dias' })` */
export const refundRequestDto = z.strictObject({
  paymentId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(REFUND_REASON_MIN_LENGTH, {
      error: (issue) =>
        `reason of ${String(issue.input).length} characters: expected at least ${REFUND_REASON_MIN_LENGTH}`,
    })
    .max(REFUND_REASON_MAX_LENGTH),
});
export type RefundRequestDto = z.infer<typeof refundRequestDto>;

/** Response of `POST /api/billing/admin/refunds`. */
export const refundResponseDto = z.strictObject({ payment: billingPaymentDto });
export type RefundResponseDto = z.infer<typeof refundResponseDto>;

/** The codes the billing routes answer in `apiErrorDto.code`. */
export const BILLING_ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'ACCOUNT_SUSPENDED',
  'BAD_ORIGIN',
  'VALIDATION',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'ALREADY_SUBSCRIBED',
  'NO_ACTIVE_SUBSCRIPTION',
  'PAYMENT_NOT_FOUND',
  'ALREADY_REFUNDED',
  'TWO_FACTOR_REQUIRED',
  'GATEWAY_UNAVAILABLE',
  'PIX_UNAVAILABLE',
] as const;
export type BillingErrorCode = (typeof BILLING_ERROR_CODES)[number];

/** The catalog key spelled out, as the export repeats it for a reader without the catalog. */
const exportedPriceFields = {
  priceKey: billingPriceKeyDto,
  plan: z.enum(BILLING_PLANS),
  period: z.enum(BILLING_PERIODS),
  months: z.number().int().positive(),
  method: billingMethodDto,
  amountCents: z.number().int().positive(),
  currency: z.literal('BRL'),
};

/** One subscription in the account's own export. */
export const billingExportSubscriptionDto = z.strictObject({
  id: z.uuid(),
  ...exportedPriceFields,
  status: z.enum(BILLING_SUBSCRIPTION_STATUSES),
  renews: z.boolean(),
  currentPeriodEnd: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type BillingExportSubscriptionDto = z.infer<typeof billingExportSubscriptionDto>;

/** One payment in the account's own export; the only gateway id it keeps is the payment number
 *  the Mercado Pago receipt shows. */
export const billingExportPaymentDto = z.strictObject({
  id: z.uuid(),
  subscriptionId: z.uuid().nullable(),
  ...exportedPriceFields,
  status: z.enum(BILLING_PAYMENT_STATUSES),
  coversFrom: z.iso.datetime().nullable(),
  coversUntil: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  mercadoPagoPaymentId: z.string().nullable(),
});
export type BillingExportPaymentDto = z.infer<typeof billingExportPaymentDto>;

/** Response of `GET /api/billing/export` (the session's own account): the subscriptions and the
 *  payments, newest first; both empty for an account that never paid.
 *
 *  Example: `billingExportDto.parse(body).payments[0].status // 'refunded'` */
export const billingExportDto = z.strictObject({
  exportedAt: z.iso.datetime(),
  subscriptions: z.array(billingExportSubscriptionDto),
  payments: z.array(billingExportPaymentDto),
});
export type BillingExportDto = z.infer<typeof billingExportDto>;
