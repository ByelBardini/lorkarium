import {
  BILLING_ERROR_CODES,
  billingAdminAccountDto,
  billingPricesResponseDto,
  billingStatusDto,
  cancelSubscriptionResponseDto,
  checkoutResponseDto,
  refundResponseDto,
  type BillingAdminAccountDto,
  type BillingErrorCode,
  type BillingPaymentDto,
  type BillingPriceDto,
  type BillingStatusDto,
  type BillingSubscriptionDto,
  type CheckoutRequestDto,
  type RefundRequestDto,
} from '@lorkarium/contracts';
import { callApi, errorCodeOf, parseOk, retryAfterOf, type ApiCall } from './api-call';
import type { HttpTransport } from './http-transport';

/** Why a call to the billing service did not give its answer. */
export type BillingFailure =
  | Readonly<{ kind: 'offline' }>
  | Readonly<{ kind: 'unexpected' }>
  | Readonly<{ kind: 'rate_limited'; retryAfterSeconds: number }>
  | Readonly<{ kind: 'refused'; code: BillingErrorCode | null }>;

export type BillingResult<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; failure: BillingFailure }>;

/** The routes of the billing service (`/api/billing/*`, another application behind the same
 *  origin). Failures come back as values, never thrown. */
export interface BillingApi {
  /** The catalog, in cents; the amount shown is always this one. */
  prices(): Promise<BillingResult<readonly BillingPriceDto[]>>;
  /** The session's paid plan, its end, the paid period's end and the subscription. */
  status(): Promise<BillingResult<BillingStatusDto>>;
  /** Where to send the browser to pay; only a host of the Mercado Pago ever comes back. */
  checkout(request: CheckoutRequestDto): Promise<BillingResult<string>>;
  /** Stops the renewal of the card subscription; the plan holds until the period ends. */
  cancel(): Promise<BillingResult<BillingSubscriptionDto>>;
  /** The backoffice view of an account's billing (admins only). */
  adminAccount(userId: string): Promise<BillingResult<BillingAdminAccountDto>>;
  /** The whole payment back, with a reason; `idempotencyKey` is one per attempt of the dialog. */
  refund(
    request: RefundRequestDto,
    idempotencyKey: string,
  ): Promise<BillingResult<BillingPaymentDto>>;
}

/** `BillingApi` over HTTP: every answer validated by its contracts DTO.
 *
 *  Example: `const result = await new HttpBillingApi(transport).checkout({ priceKey, method }); if (result.ok) goToCheckout(result.value)` */
export class HttpBillingApi implements BillingApi {
  constructor(private readonly transport: HttpTransport) {}

  async prices(): Promise<BillingResult<readonly BillingPriceDto[]>> {
    const call = await callApi(this.transport, 'GET', '/billing/prices');
    return resultOf(call, (body) => parseOk(billingPricesResponseDto, body, (dto) => dto.prices));
  }

  async status(): Promise<BillingResult<BillingStatusDto>> {
    const call = await callApi(this.transport, 'GET', '/billing/status');
    return resultOf(call, (body) => parseOk(billingStatusDto, body, (dto) => dto));
  }

  async checkout(request: CheckoutRequestDto): Promise<BillingResult<string>> {
    const call = await callApi(this.transport, 'POST', '/billing/checkout', request);
    return resultOf(call, (body) => parseOk(checkoutResponseDto, body, (dto) => dto.redirectUrl));
  }

  async cancel(): Promise<BillingResult<BillingSubscriptionDto>> {
    const call = await callApi(this.transport, 'POST', '/billing/cancel');
    return resultOf(call, (body) =>
      parseOk(cancelSubscriptionResponseDto, body, (dto) => dto.subscription),
    );
  }

  async adminAccount(userId: string): Promise<BillingResult<BillingAdminAccountDto>> {
    const path = `/billing/admin/accounts/${encodeURIComponent(userId)}`;
    const call = await callApi(this.transport, 'GET', path);
    return resultOf(call, (body) => parseOk(billingAdminAccountDto, body, (dto) => dto));
  }

  async refund(
    request: RefundRequestDto,
    idempotencyKey: string,
  ): Promise<BillingResult<BillingPaymentDto>> {
    const headers = { 'x-idempotency-key': idempotencyKey };
    const call = await callApi(this.transport, 'POST', '/billing/admin/refunds', request, headers);
    return resultOf(call, (body) => parseOk(refundResponseDto, body, (dto) => dto.payment));
  }
}

function resultOf<T>(call: ApiCall, parse: (body: unknown) => BillingResult<T>): BillingResult<T> {
  if (call.kind === 'offline') return { ok: false, failure: { kind: 'offline' } };
  if (call.kind === 'ok') return parse(call.body);
  if (call.response.status === 429) {
    const retryAfterSeconds = retryAfterOf(call.response);
    return { ok: false, failure: { kind: 'rate_limited', retryAfterSeconds } };
  }
  return {
    ok: false,
    failure: { kind: 'refused', code: billingCodeOf(errorCodeOf(call.response)) },
  };
}

function billingCodeOf(code: string | null): BillingErrorCode | null {
  return BILLING_ERROR_CODES.find((known) => known === code) ?? null;
}
