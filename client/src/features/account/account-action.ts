import {
  changeEmailRequestDto,
  changePasswordRequestDto,
  sessionParamsDto,
  twoFactorConfirmRequestDto,
  twoFactorEnableRequestDto,
  twoFactorSetupRequestDto,
  updateProfileRequestDto,
  type ProfileDto,
  type TwoFactorSetupResponseDto,
} from '@lorkarium/contracts';
import type { ActionFunction } from 'react-router';
import { z } from 'zod';
import type { AppDependencies } from '@/app/router';
import type { AccountResult } from '@/services/account-failure';
import type { AccountFailure } from './account-messages';
import { applyProfileToSession } from './session-profile';

const accountActionRequest = z.discriminatedUnion('intent', [
  z.strictObject({ intent: z.literal('profile-update'), input: updateProfileRequestDto }),
  z.strictObject({ intent: z.literal('avatar-remove') }),
  z.strictObject({ intent: z.literal('dice-texture-remove') }),
  z.strictObject({ intent: z.literal('password-change'), input: changePasswordRequestDto }),
  z.strictObject({ intent: z.literal('email-change'), input: changeEmailRequestDto }),
  z.strictObject({ intent: z.literal('email-cancel') }),
  z.strictObject({ intent: z.literal('session-revoke'), input: sessionParamsDto }),
  z.strictObject({ intent: z.literal('sessions-revoke-others') }),
  z.strictObject({ intent: z.literal('two-factor-setup'), input: twoFactorSetupRequestDto }),
  z.strictObject({ intent: z.literal('two-factor-enable'), input: twoFactorEnableRequestDto }),
  z.strictObject({ intent: z.literal('two-factor-disable'), input: twoFactorConfirmRequestDto }),
  z.strictObject({
    intent: z.literal('recovery-codes-regenerate'),
    input: twoFactorConfirmRequestDto,
  }),
]);

/** What the account screen sends to its action (JSON), already normalized by the DTO. */
export type AccountActionRequest = z.infer<typeof accountActionRequest>;
export type AccountIntent = AccountActionRequest['intent'];

/** What the action answers to the fetcher that sent the intent. */
export type AccountActionResult =
  | Readonly<{ intent: AccountIntent | null; failure: AccountFailure }>
  | Readonly<{ intent: 'two-factor-setup'; setup: TwoFactorSetupResponseDto }>
  | Readonly<{ intent: 'two-factor-enable' | 'recovery-codes-regenerate'; recoveryCodes: string[] }>
  | Readonly<{ intent: 'sessions-revoke-others'; revoked: number }>
  | Readonly<{ intent: 'email-change'; pendingEmail: string }>
  | Readonly<{ intent: AccountIntent; done: true }>;

/** A command refused because the session fell, thrown to the route's `ErrorBoundary`, which signs
 *  out and goes to the login. Not a `redirect`: signing out here makes the shell render nothing,
 *  which unmounts the fetcher, and the router drops the redirect of a fetcher queued for deletion.
 *
 *  Example: `if (error instanceof AccountSignedOutError) return <SignedOutRedirect sessionStore={sessionStore} />` */
export class AccountSignedOutError extends Error {
  constructor(readonly intent: AccountIntent) {
    super(`the API answered unauthenticated to the account command "${intent}"`);
    this.name = 'AccountSignedOutError';
  }
}

type ActionContext = Readonly<{ deps: AppDependencies }>;
type CommandOf<I extends AccountIntent> = Extract<AccountActionRequest, { intent: I }>;
type Handlers = {
  [I in AccountIntent]: (
    command: CommandOf<I>,
    context: ActionContext,
  ) => Promise<AccountActionResult>;
};

const HANDLERS: Handlers = {
  'profile-update': async ({ input }, context) =>
    profileOutcome(await context.deps.profileApi.update(input), 'profile-update', context),
  'avatar-remove': async (_, context) =>
    profileOutcome(await context.deps.profileApi.removeAvatar(), 'avatar-remove', context),
  'dice-texture-remove': async (_, context) =>
    profileOutcome(
      await context.deps.profileApi.removeDiceTexture(),
      'dice-texture-remove',
      context,
    ),
  'password-change': async ({ input }, context) =>
    doneOutcome(await security(context).changePassword(input), 'password-change'),
  'email-change': async ({ input }, context) =>
    outcome(await security(context).requestEmailChange(input), 'email-change', (pendingEmail) => ({
      intent: 'email-change',
      pendingEmail,
    })),
  'email-cancel': async (_, context) =>
    doneOutcome(await security(context).cancelEmailChange(), 'email-cancel'),
  'session-revoke': async ({ input }, context) =>
    doneOutcome(await security(context).revokeSession(input.sessionId), 'session-revoke'),
  'sessions-revoke-others': async (_, context) =>
    outcome(await security(context).revokeOtherSessions(), 'sessions-revoke-others', (revoked) => ({
      intent: 'sessions-revoke-others',
      revoked,
    })),
  'two-factor-setup': async ({ input }, context) =>
    outcome(await security(context).setupTwoFactor(input), 'two-factor-setup', (setup) => ({
      intent: 'two-factor-setup',
      setup,
    })),
  'two-factor-enable': async ({ input }, context) =>
    outcome(
      await security(context).enableTwoFactor(input),
      'two-factor-enable',
      (recoveryCodes) => ({ intent: 'two-factor-enable', recoveryCodes }),
    ),
  'two-factor-disable': async ({ input }, context) =>
    doneOutcome(await security(context).disableTwoFactor(input), 'two-factor-disable'),
  'recovery-codes-regenerate': async ({ input }, context) =>
    outcome(
      await security(context).regenerateRecoveryCodes(input),
      'recovery-codes-regenerate',
      (recoveryCodes) => ({ intent: 'recovery-codes-regenerate', recoveryCodes }),
    ),
};

/** Every command of "Minha conta" (profile, password, e-mail, sessions, 2FA) by intent; after it
 *  the router reloads the account by itself. A fallen session throws `AccountSignedOutError`.
 *
 *  Example: `fetcher.submit({ intent: 'email-cancel' }, { method: 'post', encType: 'application/json' })` */
export function accountAction(deps: AppDependencies): ActionFunction {
  return async ({ request }): Promise<AccountActionResult> => {
    const parsed = accountActionRequest.safeParse(await request.json());
    if (!parsed.success) return { intent: null, failure: { kind: 'invalid' } };
    // The map is keyed by the intent, so the command always meets its own handler.
    const handle = HANDLERS[parsed.data.intent] as (
      command: AccountActionRequest,
      context: ActionContext,
    ) => Promise<AccountActionResult>;
    return handle(parsed.data, { deps });
  };
}

function security(context: ActionContext): AppDependencies['accountSecurityApi'] {
  return context.deps.accountSecurityApi;
}

function profileOutcome(
  result: AccountResult<ProfileDto, AccountFailure>,
  intent: AccountIntent,
  context: ActionContext,
): AccountActionResult {
  if (result.ok) applyProfileToSession(context.deps.sessionStore, result.value);
  return doneOutcome(result, intent);
}

function doneOutcome<T>(
  result: AccountResult<T, AccountFailure>,
  intent: AccountIntent,
): AccountActionResult {
  return outcome(result, intent, () => ({ intent, done: true }));
}

function outcome<T>(
  result: AccountResult<T, AccountFailure>,
  intent: AccountIntent,
  wrap: (value: T) => AccountActionResult,
): AccountActionResult {
  if (result.ok) return wrap(result.value);
  const { failure } = result;
  if (failure.kind === 'unauthenticated') throw new AccountSignedOutError(intent);
  return { intent, failure };
}
