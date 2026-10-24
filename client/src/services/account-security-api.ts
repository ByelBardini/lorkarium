import {
  accountRecoveryCheckResponseDto,
  accountSecurityResponseDto,
  accountSessionsResponseDto,
  changeEmailResponseDto,
  recoveryCodesResponseDto,
  revokeOthersResponseDto,
  twoFactorSetupResponseDto,
  type AccountRecoveryCheckResponseDto,
  type AccountSecurityDto,
  type AccountSessionDto,
  type ChangeEmailRequestDto,
  type ChangePasswordRequestDto,
  type ConfirmEmailRequestDto,
  type TwoFactorConfirmRequestDto,
  type TwoFactorEnableRequestDto,
  type TwoFactorSetupRequestDto,
  type TwoFactorSetupResponseDto,
} from '@lorkarium/contracts';
import type { z } from 'zod';
import { callApi, parseOk, type ApiCall } from './api-call';
import {
  commandFailureOf,
  loadFailureOf,
  type AccountCommonFailure,
  type AccountLoadFailure,
  type AccountResult,
} from './account-failure';
import type { HttpTransport } from './http-transport';

/** Every refusal of the "Conta e segurança" routes that the screen tells apart. */
export type AccountSecurityFailure =
  | AccountCommonFailure
  | Readonly<{ kind: 'current_password_invalid' }>
  | Readonly<{ kind: 'email_taken' }>
  | Readonly<{ kind: 'email_unchanged' }>
  | Readonly<{ kind: 'email_token_invalid' }>
  | Readonly<{ kind: 'session_not_found' }>
  | Readonly<{ kind: 'current_session' }>
  | Readonly<{ kind: 'two_factor_code_invalid' }>
  | Readonly<{ kind: 'two_factor_already_enabled' }>
  | Readonly<{ kind: 'two_factor_not_started' }>
  | Readonly<{ kind: 'two_factor_not_enabled' }>
  | Readonly<{ kind: 'recovery_token_invalid' }>;

/** What a "Não fui eu" link will do: its kind and the masked address involved (or `null`). */
export type AccountRecoveryView = AccountRecoveryCheckResponseDto['recovery'];

export type SecurityResult<T> = AccountResult<T, AccountSecurityFailure>;

/** What the "Conta e segurança" section needs from `/api/account/*`; failures come back as values. */
export interface AccountSecurityApi {
  security(): Promise<AccountResult<AccountSecurityDto, AccountLoadFailure>>;
  sessions(): Promise<AccountResult<AccountSessionDto[], AccountLoadFailure>>;
  changePassword(input: ChangePasswordRequestDto): Promise<SecurityResult<null>>;
  requestEmailChange(input: ChangeEmailRequestDto): Promise<SecurityResult<string>>;
  cancelEmailChange(): Promise<SecurityResult<null>>;
  confirmEmail(input: ConfirmEmailRequestDto): Promise<SecurityResult<null>>;
  revokeSession(sessionId: string): Promise<SecurityResult<null>>;
  revokeOtherSessions(): Promise<SecurityResult<number>>;
  setupTwoFactor(
    input: TwoFactorSetupRequestDto,
  ): Promise<SecurityResult<TwoFactorSetupResponseDto>>;
  enableTwoFactor(input: TwoFactorEnableRequestDto): Promise<SecurityResult<string[]>>;
  disableTwoFactor(input: TwoFactorConfirmRequestDto): Promise<SecurityResult<null>>;
  regenerateRecoveryCodes(input: TwoFactorConfirmRequestDto): Promise<SecurityResult<string[]>>;
  /** Public: what the recovery link will do. */
  checkRecovery(token: string): Promise<SecurityResult<AccountRecoveryView>>;
  /** Public: undoes, sets the new password and signs every device out. */
  recover(token: string, newPassword: string): Promise<SecurityResult<null>>;
}

const FAILURE_BY_CODE: Readonly<Record<string, AccountSecurityFailure>> = {
  CURRENT_PASSWORD_INVALID: { kind: 'current_password_invalid' },
  EMAIL_TAKEN: { kind: 'email_taken' },
  EMAIL_UNCHANGED: { kind: 'email_unchanged' },
  EMAIL_TOKEN_INVALID: { kind: 'email_token_invalid' },
  SESSION_NOT_FOUND: { kind: 'session_not_found' },
  CURRENT_SESSION: { kind: 'current_session' },
  TWO_FACTOR_CODE_INVALID: { kind: 'two_factor_code_invalid' },
  TWO_FACTOR_ALREADY_ENABLED: { kind: 'two_factor_already_enabled' },
  TWO_FACTOR_NOT_STARTED: { kind: 'two_factor_not_started' },
  TWO_FACTOR_NOT_ENABLED: { kind: 'two_factor_not_enabled' },
  RECOVERY_TOKEN_INVALID: { kind: 'recovery_token_invalid' },
};

const DONE: SecurityResult<null> = { ok: true, value: null };

/** `AccountSecurityApi` over HTTP: validates every answer by the contracts DTO.
 *
 *  Example: `const result = await new HttpAccountSecurityApi(transport).sessions(); if (result.ok) …` */
export class HttpAccountSecurityApi implements AccountSecurityApi {
  constructor(private readonly transport: HttpTransport) {}

  async security(): Promise<AccountResult<AccountSecurityDto, AccountLoadFailure>> {
    const call = await callApi(this.transport, 'GET', '/account/security');
    if (call.kind !== 'ok') return { ok: false, failure: loadFailureOf(call) };
    return parseOk(accountSecurityResponseDto, call.body, (body) => body.security);
  }

  async sessions(): Promise<AccountResult<AccountSessionDto[], AccountLoadFailure>> {
    const call = await callApi(this.transport, 'GET', '/account/sessions');
    if (call.kind !== 'ok') return { ok: false, failure: loadFailureOf(call) };
    return parseOk(accountSessionsResponseDto, call.body, (body) => body.sessions);
  }

  async changePassword(input: ChangePasswordRequestDto): Promise<SecurityResult<null>> {
    return doneOf(await callApi(this.transport, 'POST', '/account/password', input));
  }

  async requestEmailChange(input: ChangeEmailRequestDto): Promise<SecurityResult<string>> {
    const call = await callApi(this.transport, 'POST', '/account/email', input);
    return answerOf(call, changeEmailResponseDto, (body) => body.pendingEmail);
  }

  async cancelEmailChange(): Promise<SecurityResult<null>> {
    return doneOf(await callApi(this.transport, 'DELETE', '/account/email'));
  }

  async confirmEmail(input: ConfirmEmailRequestDto): Promise<SecurityResult<null>> {
    return doneOf(await callApi(this.transport, 'POST', '/account/email/confirm', input));
  }

  async revokeSession(sessionId: string): Promise<SecurityResult<null>> {
    const path = `/account/sessions/${encodeURIComponent(sessionId)}`;
    return doneOf(await callApi(this.transport, 'DELETE', path));
  }

  async revokeOtherSessions(): Promise<SecurityResult<number>> {
    const call = await callApi(this.transport, 'POST', '/account/sessions/revoke-others');
    return answerOf(call, revokeOthersResponseDto, (body) => body.revoked);
  }

  async setupTwoFactor(
    input: TwoFactorSetupRequestDto,
  ): Promise<SecurityResult<TwoFactorSetupResponseDto>> {
    const call = await callApi(this.transport, 'POST', '/account/two-factor/setup', input);
    return answerOf(call, twoFactorSetupResponseDto, (body) => body);
  }

  async enableTwoFactor(input: TwoFactorEnableRequestDto): Promise<SecurityResult<string[]>> {
    const call = await callApi(this.transport, 'POST', '/account/two-factor/enable', input);
    return answerOf(call, recoveryCodesResponseDto, (body) => body.recoveryCodes);
  }

  async disableTwoFactor(input: TwoFactorConfirmRequestDto): Promise<SecurityResult<null>> {
    return doneOf(await callApi(this.transport, 'POST', '/account/two-factor/disable', input));
  }

  async regenerateRecoveryCodes(
    input: TwoFactorConfirmRequestDto,
  ): Promise<SecurityResult<string[]>> {
    const path = '/account/two-factor/recovery-codes';
    const call = await callApi(this.transport, 'POST', path, input);
    return answerOf(call, recoveryCodesResponseDto, (body) => body.recoveryCodes);
  }

  async checkRecovery(token: string): Promise<SecurityResult<AccountRecoveryView>> {
    const call = await callApi(this.transport, 'POST', '/account/recovery/check', { token });
    return answerOf(call, accountRecoveryCheckResponseDto, (body) => body.recovery);
  }

  async recover(token: string, newPassword: string): Promise<SecurityResult<null>> {
    const body = { token, newPassword };
    return doneOf(await callApi(this.transport, 'POST', '/account/recovery', body));
  }
}

function doneOf(call: ApiCall): SecurityResult<null> {
  return call.kind === 'ok' ? DONE : refusedOf(call);
}

function answerOf<S extends z.ZodType, T>(
  call: ApiCall,
  schema: S,
  pick: (parsed: z.infer<S>) => T,
): SecurityResult<T> {
  return call.kind === 'ok' ? parseOk(schema, call.body, pick) : refusedOf(call);
}

function refusedOf(call: Exclude<ApiCall, { kind: 'ok' }>): SecurityResult<never> {
  return { ok: false, failure: commandFailureOf(call, FAILURE_BY_CODE) };
}
