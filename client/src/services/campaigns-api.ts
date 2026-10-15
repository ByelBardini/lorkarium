import {
  campaignResponseDto,
  joinCampaignResponseDto,
  listCampaignsResponseDto,
  type CampaignDetailDto,
  type CampaignSummaryDto,
  type CreateCampaignRequestDto,
  type JoinCampaignRequestDto,
} from '@lorkarium/contracts';
import { callApi, errorCodeOf, parseOk, retryAfterOf, type ApiCall } from './api-call';
import type { HttpResponse, HttpTransport } from './http-transport';

export type CampaignsFailure =
  | Readonly<{ kind: 'unauthenticated' }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'password_required' }>
  | Readonly<{ kind: 'password_invalid' }>
  | Readonly<{ kind: 'rate_limited'; retryAfterSeconds: number }>
  | Readonly<{ kind: 'offline' }>
  | Readonly<{ kind: 'unexpected' }>;

export type CampaignsFailureKind = CampaignsFailure['kind'];

export type CampaignsResult<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; failure: CampaignsFailure }>;

/** What the screens need from `/api/campaigns`; failures come back as values, never thrown. */
export interface CampaignsApi {
  list(): Promise<CampaignsResult<CampaignSummaryDto[]>>;
  create(input: CreateCampaignRequestDto): Promise<CampaignsResult<CampaignDetailDto>>;
  detail(campaignId: string): Promise<CampaignsResult<CampaignDetailDto>>;
  join(input: JoinCampaignRequestDto): Promise<CampaignsResult<CampaignSummaryDto>>;
  enter(campaignId: string): Promise<CampaignsResult<null>>;
}

const FAILURE_BY_STATUS: Readonly<Record<number, CampaignsFailure>> = {
  400: { kind: 'invalid' },
  401: { kind: 'unauthenticated' },
  404: { kind: 'not_found' },
};

const FAILURE_BY_FORBIDDEN_CODE: Readonly<Record<string, CampaignsFailure>> = {
  CAMPAIGN_PASSWORD_REQUIRED: { kind: 'password_required' },
  CAMPAIGN_PASSWORD_INVALID: { kind: 'password_invalid' },
};

/** `CampaignsApi` over HTTP: validates every answer by the contracts DTO.
 *
 *  Example: `const result = await new HttpCampaignsApi(transport).list(); if (result.ok) …` */
export class HttpCampaignsApi implements CampaignsApi {
  constructor(private readonly transport: HttpTransport) {}

  async list(): Promise<CampaignsResult<CampaignSummaryDto[]>> {
    const call = await callApi(this.transport, 'GET', '/campaigns');
    if (call.kind !== 'ok') return failed(call);
    return parseOk(listCampaignsResponseDto, call.body, (body) => body.campaigns);
  }

  async create(input: CreateCampaignRequestDto): Promise<CampaignsResult<CampaignDetailDto>> {
    const call = await callApi(this.transport, 'POST', '/campaigns', input);
    if (call.kind !== 'ok') return failed(call);
    return parseOk(campaignResponseDto, call.body, (body) => body.campaign);
  }

  async detail(campaignId: string): Promise<CampaignsResult<CampaignDetailDto>> {
    const call = await callApi(this.transport, 'GET', campaignPath(campaignId));
    if (call.kind !== 'ok') return failed(call);
    return parseOk(campaignResponseDto, call.body, (body) => body.campaign);
  }

  async join(input: JoinCampaignRequestDto): Promise<CampaignsResult<CampaignSummaryDto>> {
    const call = await callApi(this.transport, 'POST', '/campaigns/join', input);
    if (call.kind !== 'ok') return failed(call);
    return parseOk(joinCampaignResponseDto, call.body, (body) => body.campaign);
  }

  async enter(campaignId: string): Promise<CampaignsResult<null>> {
    const call = await callApi(this.transport, 'POST', `${campaignPath(campaignId)}/enter`);
    return call.kind === 'ok' ? { ok: true, value: null } : failed(call);
  }
}

function campaignPath(campaignId: string): string {
  return `/campaigns/${encodeURIComponent(campaignId)}`;
}

function failed(call: Exclude<ApiCall, { kind: 'ok' }>): CampaignsResult<never> {
  if (call.kind === 'offline') return { ok: false, failure: { kind: 'offline' } };
  return { ok: false, failure: failureOf(call.response) };
}

function failureOf(response: HttpResponse): CampaignsFailure {
  if (response.status === 429) {
    return { kind: 'rate_limited', retryAfterSeconds: retryAfterOf(response) };
  }
  if (response.status === 403) {
    return FAILURE_BY_FORBIDDEN_CODE[errorCodeOf(response) ?? ''] ?? { kind: 'unexpected' };
  }
  return FAILURE_BY_STATUS[response.status] ?? { kind: 'unexpected' };
}
