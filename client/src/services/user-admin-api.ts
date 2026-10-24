import {
  adminDirectoryResponseDto,
  adminUserResponseDto,
  apiErrorDto,
  mailSamplesResponseDto,
  sendMailSampleResponseDto,
  invitationLinkResponseDto,
  passwordResetLinkResponseDto,
  userDeletionCheckDto,
  type AdminDirectoryResponseDto,
  type AdminUserDto,
  type BlockingCampaignDto,
  type CreateInvitationRequestDto,
  type InvitationLinkResponseDto,
  type MailSampleDto,
  type SendMailSampleResponseDto,
  type PasswordResetLinkResponseDto,
  type UserDeletionCheckDto,
  type UserRoleDto,
} from '@lorkarium/contracts';
import type { z } from 'zod';
import { callApi, parseOk, retryAfterOf, type ApiCall } from './api-call';
import type { HttpResponse, HttpTransport } from './http-transport';

/** Every refusal of the backoffice routes that the screen tells apart. */
export type UserAdminFailure =
  | Readonly<{ kind: 'unauthenticated' }>
  | Readonly<{ kind: 'forbidden' }>
  | Readonly<{ kind: 'self_action' }>
  | Readonly<{ kind: 'owns_shared_campaigns'; blockingCampaigns: BlockingCampaignDto[] }>
  | Readonly<{ kind: 'email_taken' }>
  | Readonly<{ kind: 'already_invited'; invitationId: string | null }>
  | Readonly<{ kind: 'account_suspended' }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'mail_delivery_failed' }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'rate_limited'; retryAfterSeconds: number }>
  | Readonly<{ kind: 'offline' }>
  | Readonly<{ kind: 'unexpected' }>;

export type UserAdminResult<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; failure: UserAdminFailure }>;

/** What the backoffice needs from `/api/admin/*`; failures come back as values, never thrown. */
export interface UserAdminApi {
  directory(): Promise<UserAdminResult<AdminDirectoryResponseDto>>;
  invite(input: CreateInvitationRequestDto): Promise<UserAdminResult<InvitationLinkResponseDto>>;
  resendInvitation(invitationId: string): Promise<UserAdminResult<InvitationLinkResponseDto>>;
  cancelInvitation(invitationId: string): Promise<UserAdminResult<null>>;
  changeRole(userId: string, role: UserRoleDto): Promise<UserAdminResult<AdminUserDto>>;
  suspend(userId: string): Promise<UserAdminResult<AdminUserDto>>;
  reactivate(userId: string): Promise<UserAdminResult<AdminUserDto>>;
  sendPasswordLink(userId: string): Promise<UserAdminResult<PasswordResetLinkResponseDto>>;
  deletionCheck(userId: string): Promise<UserAdminResult<UserDeletionCheckDto>>;
  deleteUser(userId: string): Promise<UserAdminResult<null>>;
  /** Every system e-mail the backoffice can send as a test. */
  mailSamples(): Promise<UserAdminResult<MailSampleDto[]>>;
  sendMailSample(sampleId: string, to: string): Promise<UserAdminResult<SendMailSampleResponseDto>>;
}

const FAILURE_BY_CODE: Readonly<Record<string, UserAdminFailure>> = {
  FORBIDDEN_ROLE: { kind: 'forbidden' },
  SELF_ACTION: { kind: 'self_action' },
  EMAIL_TAKEN: { kind: 'email_taken' },
  ACCOUNT_SUSPENDED: { kind: 'account_suspended' },
  USER_NOT_FOUND: { kind: 'not_found' },
  INVITATION_NOT_FOUND: { kind: 'not_found' },
  MAIL_SAMPLE_NOT_FOUND: { kind: 'not_found' },
  MAIL_DELIVERY_FAILED: { kind: 'mail_delivery_failed' },
};

/** `UserAdminApi` over HTTP: validates every answer by the contracts DTO.
 *
 *  Example: `const result = await new HttpUserAdminApi(transport).directory(); if (result.ok) …` */
export class HttpUserAdminApi implements UserAdminApi {
  constructor(private readonly transport: HttpTransport) {}

  async directory(): Promise<UserAdminResult<AdminDirectoryResponseDto>> {
    const call = await callApi(this.transport, 'GET', '/admin/users');
    return answerOf(call, adminDirectoryResponseDto, (body) => body);
  }

  async invite(
    input: CreateInvitationRequestDto,
  ): Promise<UserAdminResult<InvitationLinkResponseDto>> {
    const call = await callApi(this.transport, 'POST', '/admin/invitations', input);
    return answerOf(call, invitationLinkResponseDto, (body) => body);
  }

  async resendInvitation(
    invitationId: string,
  ): Promise<UserAdminResult<InvitationLinkResponseDto>> {
    const call = await callApi(this.transport, 'POST', `${invitationPath(invitationId)}/resend`);
    return answerOf(call, invitationLinkResponseDto, (body) => body);
  }

  async cancelInvitation(invitationId: string): Promise<UserAdminResult<null>> {
    return doneOf(await callApi(this.transport, 'DELETE', invitationPath(invitationId)));
  }

  async changeRole(userId: string, role: UserRoleDto): Promise<UserAdminResult<AdminUserDto>> {
    const call = await callApi(this.transport, 'PATCH', userPath(userId), { role });
    return answerOf(call, adminUserResponseDto, (body) => body.user);
  }

  async suspend(userId: string): Promise<UserAdminResult<AdminUserDto>> {
    const call = await callApi(this.transport, 'POST', `${userPath(userId)}/suspend`);
    return answerOf(call, adminUserResponseDto, (body) => body.user);
  }

  async reactivate(userId: string): Promise<UserAdminResult<AdminUserDto>> {
    const call = await callApi(this.transport, 'POST', `${userPath(userId)}/reactivate`);
    return answerOf(call, adminUserResponseDto, (body) => body.user);
  }

  async sendPasswordLink(userId: string): Promise<UserAdminResult<PasswordResetLinkResponseDto>> {
    const call = await callApi(this.transport, 'POST', `${userPath(userId)}/password-reset`);
    return answerOf(call, passwordResetLinkResponseDto, (body) => body);
  }

  async deletionCheck(userId: string): Promise<UserAdminResult<UserDeletionCheckDto>> {
    const call = await callApi(this.transport, 'GET', `${userPath(userId)}/deletion-check`);
    return answerOf(call, userDeletionCheckDto, (body) => body);
  }

  async deleteUser(userId: string): Promise<UserAdminResult<null>> {
    return doneOf(await callApi(this.transport, 'DELETE', userPath(userId)));
  }

  async mailSamples(): Promise<UserAdminResult<MailSampleDto[]>> {
    const call = await callApi(this.transport, 'GET', '/admin/mail-samples');
    return answerOf(call, mailSamplesResponseDto, (body) => body.samples);
  }

  async sendMailSample(
    sampleId: string,
    to: string,
  ): Promise<UserAdminResult<SendMailSampleResponseDto>> {
    const path = `/admin/mail-samples/${encodeURIComponent(sampleId)}/send`;
    const call = await callApi(this.transport, 'POST', path, { to });
    return answerOf(call, sendMailSampleResponseDto, (body) => body);
  }
}

function userPath(userId: string): string {
  return `/admin/users/${encodeURIComponent(userId)}`;
}

function invitationPath(invitationId: string): string {
  return `/admin/invitations/${encodeURIComponent(invitationId)}`;
}

function doneOf(call: ApiCall): UserAdminResult<null> {
  return call.kind === 'ok' ? { ok: true, value: null } : { ok: false, failure: failureOf(call) };
}

function answerOf<S extends z.ZodType, T>(
  call: ApiCall,
  schema: S,
  pick: (parsed: z.infer<S>) => T,
): UserAdminResult<T> {
  if (call.kind !== 'ok') return { ok: false, failure: failureOf(call) };
  return parseOk(schema, call.body, pick);
}

function failureOf(call: Exclude<ApiCall, { kind: 'ok' }>): UserAdminFailure {
  if (call.kind === 'offline') return { kind: 'offline' };
  const body = apiErrorDto.safeParse(call.response.body);
  if (!body.success) return statusFailureOf(call.response);
  const { code, blockingCampaigns, invitationId } = body.data;
  if (code === 'OWNS_SHARED_CAMPAIGNS') {
    return { kind: 'owns_shared_campaigns', blockingCampaigns: blockingCampaigns ?? [] };
  }
  if (code === 'ALREADY_INVITED')
    return { kind: 'already_invited', invitationId: invitationId ?? null };
  return FAILURE_BY_CODE[code] ?? statusFailureOf(call.response);
}

function statusFailureOf(response: HttpResponse): UserAdminFailure {
  if (response.status === 400) return { kind: 'invalid' };
  if (response.status === 401) return { kind: 'unauthenticated' };
  if (response.status === 403) return { kind: 'forbidden' };
  if (response.status === 404) return { kind: 'not_found' };
  if (response.status === 429)
    return { kind: 'rate_limited', retryAfterSeconds: retryAfterOf(response) };
  return { kind: 'unexpected' };
}
