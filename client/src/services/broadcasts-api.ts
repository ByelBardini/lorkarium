import {
  apiErrorDto,
  confirmMailBroadcastRequestDto,
  mailBroadcastAudienceDto,
  mailBroadcastAudienceRequestDto,
  mailBroadcastContentDto,
  mailBroadcastDraftResponseDto,
  mailBroadcastPreviewDto,
  mailBroadcastResponseDto,
  mailBroadcastsResponseDto,
  mailBroadcastTestResponseDto,
  type MailBroadcastContentInput,
  type MailBroadcastDraftResponseDto,
  type MailBroadcastDto,
  type MailBroadcastPreviewDto,
  type MailBroadcastSegmentDto,
  type MailBroadcastTestResponseDto,
} from '@lorkarium/contracts';
import { callApi, parseOk, retryAfterOf, type ApiCall } from './api-call';
import type { HttpResponse, HttpTransport } from './http-transport';

/** Every refusal of the backoffice notices, as a value. */
export type BroadcastsFailure =
  | Readonly<{ kind: 'unauthenticated' }>
  | Readonly<{ kind: 'forbidden' }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'already_confirmed' }>
  | Readonly<{ kind: 'test_required' }>
  | Readonly<{ kind: 'two_factor_required' }>
  | Readonly<{ kind: 'confirmation_mismatch' }>
  | Readonly<{ kind: 'mail_delivery_failed' }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'rate_limited'; retryAfterSeconds: number }>
  | Readonly<{ kind: 'offline' }>
  | Readonly<{ kind: 'unexpected' }>;

export type BroadcastsResult<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; failure: BroadcastsFailure }>;

/** The backoffice notices (`/api/admin/broadcasts`); failures come back as values, never thrown. */
export interface BroadcastsApi {
  list(): Promise<BroadcastsResult<MailBroadcastDto[]>>;
  audience(segment: MailBroadcastSegmentDto): Promise<BroadcastsResult<number>>;
  preview(content: MailBroadcastContentInput): Promise<BroadcastsResult<MailBroadcastPreviewDto>>;
  create(
    content: MailBroadcastContentInput,
  ): Promise<BroadcastsResult<MailBroadcastDraftResponseDto>>;
  rewrite(
    broadcastId: string,
    content: MailBroadcastContentInput,
  ): Promise<BroadcastsResult<MailBroadcastDraftResponseDto>>;
  sendTest(broadcastId: string): Promise<BroadcastsResult<MailBroadcastTestResponseDto>>;
  confirm(broadcastId: string, total: number): Promise<BroadcastsResult<MailBroadcastDto>>;
}

const FAILURE_BY_CODE: Readonly<Record<string, BroadcastsFailure>> = {
  UNAUTHENTICATED: { kind: 'unauthenticated' },
  FORBIDDEN_ROLE: { kind: 'forbidden' },
  BROADCAST_NOT_FOUND: { kind: 'not_found' },
  ALREADY_CONFIRMED: { kind: 'already_confirmed' },
  TEST_REQUIRED: { kind: 'test_required' },
  TWO_FACTOR_REQUIRED: { kind: 'two_factor_required' },
  CONFIRMATION_MISMATCH: { kind: 'confirmation_mismatch' },
  MAIL_DELIVERY_FAILED: { kind: 'mail_delivery_failed' },
};

const BASE = '/admin/broadcasts';

/** `BroadcastsApi` over HTTP: each body passes its DTO before leaving, each answer after.
 *
 *  Example: `await new HttpBroadcastsApi(transport).confirm(id, 1240)` */
export class HttpBroadcastsApi implements BroadcastsApi {
  constructor(private readonly transport: HttpTransport) {}

  async list(): Promise<BroadcastsResult<MailBroadcastDto[]>> {
    const call = await callApi(this.transport, 'GET', BASE);
    return answered(call, (body) => parseOk(mailBroadcastsResponseDto, body, (b) => b.broadcasts));
  }

  async audience(segment: MailBroadcastSegmentDto): Promise<BroadcastsResult<number>> {
    const body = mailBroadcastAudienceRequestDto.parse({ segment });
    const call = await callApi(this.transport, 'POST', `${BASE}/audience`, body);
    return answered(call, (raw) => parseOk(mailBroadcastAudienceDto, raw, (b) => b.audience));
  }

  async preview(
    content: MailBroadcastContentInput,
  ): Promise<BroadcastsResult<MailBroadcastPreviewDto>> {
    const body = mailBroadcastContentDto.parse(content);
    const call = await callApi(this.transport, 'POST', `${BASE}/preview`, body);
    return answered(call, (raw) => parseOk(mailBroadcastPreviewDto, raw, (b) => b));
  }

  async create(
    content: MailBroadcastContentInput,
  ): Promise<BroadcastsResult<MailBroadcastDraftResponseDto>> {
    const body = mailBroadcastContentDto.parse(content);
    const call = await callApi(this.transport, 'POST', BASE, body);
    return answered(call, (raw) => parseOk(mailBroadcastDraftResponseDto, raw, (b) => b));
  }

  async rewrite(
    broadcastId: string,
    content: MailBroadcastContentInput,
  ): Promise<BroadcastsResult<MailBroadcastDraftResponseDto>> {
    const body = mailBroadcastContentDto.parse(content);
    const call = await callApi(this.transport, 'PUT', pathOf(broadcastId), body);
    return answered(call, (raw) => parseOk(mailBroadcastDraftResponseDto, raw, (b) => b));
  }

  async sendTest(broadcastId: string): Promise<BroadcastsResult<MailBroadcastTestResponseDto>> {
    const call = await callApi(this.transport, 'POST', `${pathOf(broadcastId)}/test`);
    return answered(call, (raw) => parseOk(mailBroadcastTestResponseDto, raw, (b) => b));
  }

  async confirm(broadcastId: string, total: number): Promise<BroadcastsResult<MailBroadcastDto>> {
    const body = confirmMailBroadcastRequestDto.parse({ total });
    const call = await callApi(this.transport, 'POST', `${pathOf(broadcastId)}/confirm`, body);
    return answered(call, (raw) => parseOk(mailBroadcastResponseDto, raw, (b) => b.broadcast));
  }
}

function pathOf(broadcastId: string): string {
  return `${BASE}/${encodeURIComponent(broadcastId)}`;
}

function answered<T>(
  call: ApiCall,
  parse: (body: unknown) => BroadcastsResult<T>,
): BroadcastsResult<T> {
  if (call.kind === 'ok') return parse(call.body);
  return { ok: false, failure: broadcastsFailureOf(call) };
}

/** The failure of a refused or offline call, by the error code first and the status after.
 *
 *  Example: `broadcastsFailureOf({ kind: 'offline' }) // { kind: 'offline' }` */
export function broadcastsFailureOf(call: Exclude<ApiCall, { kind: 'ok' }>): BroadcastsFailure {
  if (call.kind === 'offline') return { kind: 'offline' };
  const body = apiErrorDto.safeParse(call.response.body);
  const known = body.success ? FAILURE_BY_CODE[body.data.code] : undefined;
  return known ?? statusFailureOf(call.response);
}

function statusFailureOf(response: HttpResponse): BroadcastsFailure {
  if (response.status === 400) return { kind: 'invalid' };
  if (response.status === 401) return { kind: 'unauthenticated' };
  if (response.status === 403) return { kind: 'forbidden' };
  if (response.status === 404) return { kind: 'not_found' };
  if (response.status === 429)
    return { kind: 'rate_limited', retryAfterSeconds: retryAfterOf(response) };
  return { kind: 'unexpected' };
}
