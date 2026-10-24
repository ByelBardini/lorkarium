import {
  acceptInvitationResponseDto,
  apiErrorDto,
  invitationInspectResponseDto,
  passwordResetInspectResponseDto,
  type AcceptInvitationRequestDto,
  type AuthUserDto,
  type InvitationInspectResponseDto,
} from '@lorkarium/contracts';
import type { z } from 'zod';
import { callApi, parseOk, retryAfterOf, type ApiCall } from './api-call';
import type { HttpTransport } from './http-transport';

/** Every refusal of the public link routes that the pages tell apart. */
export type AccountLinksFailure =
  | Readonly<{ kind: 'link_invalid' }>
  | Readonly<{ kind: 'username_taken' }>
  | Readonly<{ kind: 'email_taken' }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'rate_limited'; retryAfterSeconds: number }>
  | Readonly<{ kind: 'offline' }>
  | Readonly<{ kind: 'unexpected' }>;

export type AccountLinksResult<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; failure: AccountLinksFailure }>;

/** The public side of the one-time links (`/api/invitations/*`, `/api/password-resets/*`). */
export interface AccountLinksApi {
  inspectInvitation(token: string): Promise<AccountLinksResult<InvitationInspectResponseDto>>;
  acceptInvitation(input: AcceptInvitationRequestDto): Promise<AccountLinksResult<AuthUserDto>>;
  inspectPasswordReset(token: string): Promise<AccountLinksResult<string>>;
  completePasswordReset(token: string, newPassword: string): Promise<AccountLinksResult<null>>;
}

const FAILURE_BY_CODE: Readonly<Record<string, AccountLinksFailure>> = {
  ACCOUNT_LINK_INVALID: { kind: 'link_invalid' },
  USERNAME_TAKEN: { kind: 'username_taken' },
  EMAIL_TAKEN: { kind: 'email_taken' },
};

/** `AccountLinksApi` over HTTP: validates every answer by the contracts DTO.
 *
 *  Example: `const result = await new HttpAccountLinksApi(transport).inspectInvitation(token)` */
export class HttpAccountLinksApi implements AccountLinksApi {
  constructor(private readonly transport: HttpTransport) {}

  async inspectInvitation(
    token: string,
  ): Promise<AccountLinksResult<InvitationInspectResponseDto>> {
    const call = await callApi(this.transport, 'POST', '/invitations/inspect', { token });
    return answerOf(call, invitationInspectResponseDto, (body) => body);
  }

  async acceptInvitation(
    input: AcceptInvitationRequestDto,
  ): Promise<AccountLinksResult<AuthUserDto>> {
    const call = await callApi(this.transport, 'POST', '/invitations/accept', input);
    return answerOf(call, acceptInvitationResponseDto, (body) => body.user);
  }

  async inspectPasswordReset(token: string): Promise<AccountLinksResult<string>> {
    const call = await callApi(this.transport, 'POST', '/password-resets/inspect', { token });
    return answerOf(call, passwordResetInspectResponseDto, (body) => body.username);
  }

  async completePasswordReset(
    token: string,
    newPassword: string,
  ): Promise<AccountLinksResult<null>> {
    const call = await callApi(this.transport, 'POST', '/password-resets/complete', {
      token,
      newPassword,
    });
    return call.kind === 'ok' ? { ok: true, value: null } : { ok: false, failure: failureOf(call) };
  }
}

function answerOf<S extends z.ZodType, T>(
  call: ApiCall,
  schema: S,
  pick: (parsed: z.infer<S>) => T,
): AccountLinksResult<T> {
  if (call.kind !== 'ok') return { ok: false, failure: failureOf(call) };
  return parseOk(schema, call.body, pick);
}

function failureOf(call: Exclude<ApiCall, { kind: 'ok' }>): AccountLinksFailure {
  if (call.kind === 'offline') return { kind: 'offline' };
  const body = apiErrorDto.safeParse(call.response.body);
  const named = body.success ? FAILURE_BY_CODE[body.data.code] : undefined;
  if (named) return named;
  const { status } = call.response;
  if (status === 400) return { kind: 'invalid' };
  if (status === 404) return { kind: 'link_invalid' };
  if (status === 429)
    return { kind: 'rate_limited', retryAfterSeconds: retryAfterOf(call.response) };
  return { kind: 'unexpected' };
}
