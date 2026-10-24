import {
  createInvitationRequestDto,
  userRoleDto,
  type AdminInvitationDto,
  type AdminUserDto,
  type UserDeletionCheckDto,
} from '@lorkarium/contracts';
import type { ActionFunction } from 'react-router';
import { z } from 'zod';
import type { AppDependencies } from '@/app/router';
import type { UserAdminFailure, UserAdminResult } from '@/services/user-admin-api';

const target = { userId: z.string().min(1) };
const invitationTarget = { invitationId: z.string().min(1) };

const usersIntentDto = z.discriminatedUnion('intent', [
  createInvitationRequestDto.extend({ intent: z.literal('invite') }),
  z.strictObject({ intent: z.literal('invitation-resend'), ...invitationTarget }),
  z.strictObject({ intent: z.literal('invitation-cancel'), ...invitationTarget }),
  z.strictObject({ intent: z.literal('role'), ...target, role: userRoleDto }),
  z.strictObject({ intent: z.literal('suspend'), ...target }),
  z.strictObject({ intent: z.literal('reactivate'), ...target }),
  z.strictObject({ intent: z.literal('password-reset'), ...target }),
  z.strictObject({ intent: z.literal('deletion-check'), ...target }),
  z.strictObject({ intent: z.literal('delete'), ...target }),
]);

export type UsersIntent = z.input<typeof usersIntentDto>;
export type UsersIntentName = UsersIntent['intent'];

export type UsersActionResult =
  | Readonly<{
      intent: 'invite' | 'invitation-resend';
      invitation: AdminInvitationDto;
      link: string;
    }>
  | Readonly<{ intent: 'invitation-cancel' | 'delete'; done: true }>
  | Readonly<{ intent: 'role' | 'suspend' | 'reactivate'; user: AdminUserDto }>
  | Readonly<{ intent: 'password-reset'; link: string }>
  | Readonly<{ intent: 'deletion-check'; check: UserDeletionCheckDto }>
  | Readonly<{ intent: UsersIntentName | null; failure: UserAdminFailure }>;

/** The session fell during a fetcher's action: the route's ErrorBoundary goes to the login. */
export class AdminSignedOutError extends Error {
  constructor() {
    super('the session ended during a backoffice action');
    this.name = 'AdminSignedOutError';
  }
}

/** The role was taken away mid-visit: the ErrorBoundary says so. */
export class AdminForbiddenError extends Error {
  constructor() {
    super('the account lost the admin role during the visit');
    this.name = 'AdminForbiddenError';
  }
}

/** Every command of the users page, one intent per JSON body; a fallen session or a lost role
 *  goes to the ErrorBoundary. The router reloads the list after each one.
 *
 *  Example: `fetcher.submit({ intent: 'suspend', userId }, { method: 'post', encType: 'application/json' })` */
export function usersAction(deps: AppDependencies): ActionFunction {
  return async ({ request }): Promise<UsersActionResult> => {
    const parsed = usersIntentDto.safeParse(await request.json());
    if (!parsed.success) return { intent: null, failure: { kind: 'invalid' } };
    const result = await run(deps, parsed.data);
    if ('failure' in result && result.failure.kind === 'unauthenticated') {
      deps.sessionStore.getState().signedOut();
      throw new AdminSignedOutError();
    }
    if ('failure' in result && result.failure.kind === 'forbidden') {
      dropAdminRole(deps);
      throw new AdminForbiddenError();
    }
    return result;
  };
}

/** The role was taken away: the session forgets it, so the menu stops offering the backoffice.
 *
 *  Example: `if (failure.kind === 'forbidden') dropAdminRole(deps)` */
export function dropAdminRole({ sessionStore }: Pick<AppDependencies, 'sessionStore'>): void {
  const { session } = sessionStore.getState();
  if (session.status === 'authenticated') {
    sessionStore.getState().signedIn({ ...session.user, role: 'user' });
  }
}

async function run(
  { userAdminApi: api }: AppDependencies,
  input: UsersIntent,
): Promise<UsersActionResult> {
  switch (input.intent) {
    case 'invite':
      return linkResult(input.intent, await api.invite({ email: input.email, role: input.role }));
    case 'invitation-resend':
      return linkResult(input.intent, await api.resendInvitation(input.invitationId));
    case 'invitation-cancel':
      return doneResult(input.intent, await api.cancelInvitation(input.invitationId));
    case 'role':
      return userResult(input.intent, await api.changeRole(input.userId, input.role));
    case 'suspend':
      return userResult(input.intent, await api.suspend(input.userId));
    case 'reactivate':
      return userResult(input.intent, await api.reactivate(input.userId));
    case 'password-reset':
      return passwordLinkResult(await api.sendPasswordLink(input.userId));
    case 'deletion-check':
      return checkResult(await api.deletionCheck(input.userId));
    case 'delete':
      return doneResult(input.intent, await api.deleteUser(input.userId));
  }
}

function linkResult(
  intent: 'invite' | 'invitation-resend',
  result: UserAdminResult<Readonly<{ invitation: AdminInvitationDto; link: string }>>,
): UsersActionResult {
  return result.ok ? { intent, ...result.value } : failed(intent, result.failure);
}

function doneResult(
  intent: 'invitation-cancel' | 'delete',
  result: UserAdminResult<null>,
): UsersActionResult {
  return result.ok ? { intent, done: true } : failed(intent, result.failure);
}

function userResult(
  intent: 'role' | 'suspend' | 'reactivate',
  result: UserAdminResult<AdminUserDto>,
): UsersActionResult {
  return result.ok ? { intent, user: result.value } : failed(intent, result.failure);
}

function failed(intent: UsersIntentName, failure: UserAdminFailure): UsersActionResult {
  return { intent, failure };
}

function passwordLinkResult(
  result: UserAdminResult<Readonly<{ link: string }>>,
): UsersActionResult {
  return result.ok
    ? { intent: 'password-reset', link: result.value.link }
    : failed('password-reset', result.failure);
}

function checkResult(result: UserAdminResult<UserDeletionCheckDto>): UsersActionResult {
  return result.ok
    ? { intent: 'deletion-check', check: result.value }
    : failed('deletion-check', result.failure);
}
