import {
  accountSanctionsResponseDto,
  issueSanctionRequestDto,
  recordAppealRequestDto,
  sanctionResponseDto,
  type AccountSanctionDto,
  type IssueSanctionRequestDto,
  type RecordAppealRequestDto,
  type SanctionResponseDto,
} from '@lorkarium/contracts';
import { callApi, parseOk, type ApiCall } from './api-call';
import type { HttpTransport } from './http-transport';
import { userAdminFailureOf, type UserAdminResult } from './user-admin-api';

/** The measures against an account (admins only); failures are the backoffice's, never thrown. */
export interface SanctionsApi {
  /** The measure and the account as it is now; `null` for a ban (the account is gone). */
  issue(
    userId: string,
    body: IssueSanctionRequestDto,
  ): Promise<UserAdminResult<SanctionResponseDto | null>>;
  /** The account's measures, the newest first. */
  history(userId: string): Promise<UserAdminResult<AccountSanctionDto[]>>;
  recordAppeal(
    sanctionId: string,
    body: RecordAppealRequestDto,
  ): Promise<UserAdminResult<SanctionResponseDto>>;
}

/** `SanctionsApi` over HTTP: the body is checked by the DTO before it leaves and every answer
 *  after it comes back.
 *
 *  Example: `await new HttpSanctionsApi(transport).issue(biaId, { kind: 'warning', rule: 'spam', statement })` */
export class HttpSanctionsApi implements SanctionsApi {
  constructor(private readonly transport: HttpTransport) {}

  async issue(
    userId: string,
    body: IssueSanctionRequestDto,
  ): Promise<UserAdminResult<SanctionResponseDto | null>> {
    const parsed = issueSanctionRequestDto.safeParse(body);
    if (!parsed.success) return { ok: false, failure: { kind: 'invalid' } };
    const call = await callApi(
      this.transport,
      'POST',
      `${userPath(userId)}/sanctions`,
      parsed.data,
    );
    if (call.kind === 'ok' && call.body === null) return { ok: true, value: null };
    return answerOf(call, (ok) => parseOk(sanctionResponseDto, ok, (value) => value));
  }

  async history(userId: string): Promise<UserAdminResult<AccountSanctionDto[]>> {
    const call = await callApi(this.transport, 'GET', `${userPath(userId)}/sanctions`);
    return answerOf(call, (ok) =>
      parseOk(accountSanctionsResponseDto, ok, (value) => value.sanctions),
    );
  }

  async recordAppeal(
    sanctionId: string,
    body: RecordAppealRequestDto,
  ): Promise<UserAdminResult<SanctionResponseDto>> {
    const parsed = recordAppealRequestDto.safeParse(body);
    if (!parsed.success) return { ok: false, failure: { kind: 'invalid' } };
    const path = `/admin/sanctions/${encodeURIComponent(sanctionId)}/appeal`;
    const call = await callApi(this.transport, 'PUT', path, parsed.data);
    return answerOf(call, (ok) => parseOk(sanctionResponseDto, ok, (value) => value));
  }
}

function userPath(userId: string): string {
  return `/admin/users/${encodeURIComponent(userId)}`;
}

function answerOf<T>(
  call: ApiCall,
  parse: (body: unknown) => UserAdminResult<T>,
): UserAdminResult<T> {
  if (call.kind !== 'ok') return { ok: false, failure: userAdminFailureOf(call) };
  return parse(call.body);
}
