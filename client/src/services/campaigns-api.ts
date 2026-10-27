import {
  campaignMemberDto,
  campaignResponseDto,
  endJuggernautResponseDto,
  joinCampaignResponseDto,
  listCampaignsResponseDto,
  listPublicCampaignsResponseDto,
  type CampaignDetailDto,
  type CampaignMemberDto,
  type CampaignSummaryDto,
  type CreateCampaignRequestDto,
  type EndJuggernautResponseDto,
  type JoinCampaignRequestDto,
  type JoinPublicCampaignRequestDto,
  type PublicCampaignDto,
  type UpdateCampaignRequestInput,
  type UpdateMemberRoleRequestDto,
} from '@lorkarium/contracts';
import { callApi, errorCodeOf, parseOk, retryAfterOf, type ApiCall } from './api-call';
import type { HttpResponse, HttpTransport } from './http-transport';

export type CampaignsFailure =
  | Readonly<{ kind: 'unauthenticated' }>
  | Readonly<{ kind: 'not_found' }>
  /** The person is not a member of the table (404 `MEMBER_NOT_FOUND`): the table itself is there. */
  | Readonly<{ kind: 'member_not_found' }>
  /** A player asked for what only the master may do (403 `FORBIDDEN`). */
  | Readonly<{ kind: 'forbidden' }>
  /** The master changed the settings without the table open in a tab (403 `CAMPAIGN_NOT_OPEN`). */
  | Readonly<{ kind: 'not_open' }>
  /** An admin asked for juggernaut mode at a campaign they own (409 `ALREADY_OWNER`). */
  | Readonly<{ kind: 'already_owner' }>
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
  /** "Explorar mesas": every public campaign, with the reader's role in each (`null` = not in it). */
  listPublic(): Promise<CampaignsResult<PublicCampaignDto[]>>;
  /** Joins a public campaign without its code (as spectator; a member keeps the role). */
  joinPublic(
    campaignId: string,
    input: JoinPublicCampaignRequestDto,
  ): Promise<CampaignsResult<CampaignSummaryDto>>;
  create(input: CreateCampaignRequestDto): Promise<CampaignsResult<CampaignDetailDto>>;
  detail(campaignId: string): Promise<CampaignsResult<CampaignDetailDto>>;
  join(input: JoinCampaignRequestDto): Promise<CampaignsResult<CampaignSummaryDto>>;
  enter(campaignId: string): Promise<CampaignsResult<null>>;
  /** Master only: saves the changed fields (absent = kept; `password: null` removes it) and
   *  yields the campaign as the server stored it. */
  update(
    campaignId: string,
    input: UpdateCampaignRequestInput,
  ): Promise<CampaignsResult<CampaignDetailDto>>;
  /** Master only: a new join code; the old one stops working. */
  regenerateCode(campaignId: string): Promise<CampaignsResult<CampaignDetailDto>>;
  /** Master only: deletes the campaign and everything in it. */
  remove(campaignId: string): Promise<CampaignsResult<null>>;
  /** Master only: moves a member between the roles `assignableRolesOf` (game-core) allows — any
   *  master swaps players and spectators, owner powers also give and take `master`; yields the
   *  member as the server stored it (the table hears it as `session:memberUpdated`). */
  setMemberRole(
    campaignId: string,
    userId: string,
    role: MemberRole,
  ): Promise<CampaignsResult<CampaignMemberDto>>;
  /** Admin only: turns juggernaut mode on at the campaign (owner powers, `myRole: 'master'`);
   *  yields its detail as the server stored it. */
  startJuggernaut(campaignId: string): Promise<CampaignsResult<CampaignDetailDto>>;
  /** Admin only: turns juggernaut mode off; yields the role the admin went back to (`null`: they
   *  were not a member and left the campaign). */
  endJuggernaut(campaignId: string): Promise<CampaignsResult<EndJuggernautResponseDto>>;
}

/** The roles a master gives and takes (`master` only with owner powers). */
export type MemberRole = UpdateMemberRoleRequestDto['role'];

const FAILURE_BY_STATUS: Readonly<Record<number, CampaignsFailure>> = {
  400: { kind: 'invalid' },
  401: { kind: 'unauthenticated' },
  404: { kind: 'not_found' },
};

const FAILURE_BY_NOT_FOUND_CODE: Readonly<Record<string, CampaignsFailure>> = {
  MEMBER_NOT_FOUND: { kind: 'member_not_found' },
};

const FAILURE_BY_CONFLICT_CODE: Readonly<Record<string, CampaignsFailure>> = {
  ALREADY_OWNER: { kind: 'already_owner' },
};

const FAILURE_BY_FORBIDDEN_CODE: Readonly<Record<string, CampaignsFailure>> = {
  CAMPAIGN_PASSWORD_REQUIRED: { kind: 'password_required' },
  CAMPAIGN_PASSWORD_INVALID: { kind: 'password_invalid' },
  FORBIDDEN: { kind: 'forbidden' },
  // The account is not an admin: juggernaut mode is theirs only.
  FORBIDDEN_ROLE: { kind: 'forbidden' },
  CAMPAIGN_NOT_OPEN: { kind: 'not_open' },
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

  async listPublic(): Promise<CampaignsResult<PublicCampaignDto[]>> {
    const call = await callApi(this.transport, 'GET', '/campaigns/public');
    if (call.kind !== 'ok') return failed(call);
    return parseOk(listPublicCampaignsResponseDto, call.body, (body) => body.campaigns);
  }

  async joinPublic(
    campaignId: string,
    input: JoinPublicCampaignRequestDto,
  ): Promise<CampaignsResult<CampaignSummaryDto>> {
    const call = await callApi(this.transport, 'POST', `${campaignPath(campaignId)}/join`, input);
    if (call.kind !== 'ok') return failed(call);
    return parseOk(joinCampaignResponseDto, call.body, (body) => body.campaign);
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

  async update(
    campaignId: string,
    input: UpdateCampaignRequestInput,
  ): Promise<CampaignsResult<CampaignDetailDto>> {
    const call = await callApi(this.transport, 'PATCH', campaignPath(campaignId), input);
    if (call.kind !== 'ok') return failed(call);
    return parseOk(campaignResponseDto, call.body, (body) => body.campaign);
  }

  async regenerateCode(campaignId: string): Promise<CampaignsResult<CampaignDetailDto>> {
    const call = await callApi(this.transport, 'POST', `${campaignPath(campaignId)}/join-code`);
    if (call.kind !== 'ok') return failed(call);
    return parseOk(campaignResponseDto, call.body, (body) => body.campaign);
  }

  async remove(campaignId: string): Promise<CampaignsResult<null>> {
    const call = await callApi(this.transport, 'DELETE', campaignPath(campaignId));
    return call.kind === 'ok' ? { ok: true, value: null } : failed(call);
  }

  async setMemberRole(
    campaignId: string,
    userId: string,
    role: MemberRole,
  ): Promise<CampaignsResult<CampaignMemberDto>> {
    const path = `${campaignPath(campaignId)}/members/${encodeURIComponent(userId)}`;
    const body: UpdateMemberRoleRequestDto = { role };
    const call = await callApi(this.transport, 'PATCH', path, body);
    if (call.kind !== 'ok') return failed(call);
    return parseOk(campaignMemberDto, call.body, (member) => member);
  }

  async startJuggernaut(campaignId: string): Promise<CampaignsResult<CampaignDetailDto>> {
    const call = await callApi(this.transport, 'POST', juggernautPath(campaignId));
    if (call.kind !== 'ok') return failed(call);
    return parseOk(campaignResponseDto, call.body, (body) => body.campaign);
  }

  async endJuggernaut(campaignId: string): Promise<CampaignsResult<EndJuggernautResponseDto>> {
    const call = await callApi(this.transport, 'DELETE', juggernautPath(campaignId));
    if (call.kind !== 'ok') return failed(call);
    return parseOk(endJuggernautResponseDto, call.body, (body) => body);
  }
}

function campaignPath(campaignId: string): string {
  return `/campaigns/${encodeURIComponent(campaignId)}`;
}

function juggernautPath(campaignId: string): string {
  return `${campaignPath(campaignId)}/juggernaut`;
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
  if (response.status === 409) {
    return FAILURE_BY_CONFLICT_CODE[errorCodeOf(response) ?? ''] ?? { kind: 'unexpected' };
  }
  if (response.status === 404) {
    return FAILURE_BY_NOT_FOUND_CODE[errorCodeOf(response) ?? ''] ?? { kind: 'not_found' };
  }
  return FAILURE_BY_STATUS[response.status] ?? { kind: 'unexpected' };
}
