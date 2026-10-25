import {
  acceptInvitationRequestDto,
  completePasswordResetRequestDto,
  linkTokenDto,
  type InvitationInspectResponseDto,
} from '@lorkarium/contracts';
import { redirect, type ActionFunction } from 'react-router';
import { z } from 'zod';
import type { AppDependencies } from '@/app/router';
import type { AccountLinksFailure } from '@/services/account-links-api';

const linksIntentDto = z.discriminatedUnion('intent', [
  z.strictObject({ intent: z.literal('inspect-invitation'), token: linkTokenDto }),
  acceptInvitationRequestDto.extend({ intent: z.literal('accept') }),
  z.strictObject({ intent: z.literal('inspect-reset'), token: linkTokenDto }),
  completePasswordResetRequestDto.extend({ intent: z.literal('complete-reset') }),
]);

export type AccountLinksIntent = z.input<typeof linksIntentDto>;

export type AccountLinksActionResult =
  | Readonly<{ intent: 'inspect-invitation'; invitation: InvitationInspectResponseDto }>
  | Readonly<{ intent: 'inspect-reset'; username: string }>
  | Readonly<{ intent: 'complete-reset'; done: true }>
  | Readonly<{ intent: AccountLinksIntent['intent'] | null; failure: AccountLinksFailure }>;

/** The requests of `/invite` and `/reset-password` (public). An accepted invitation signs in and
 *  goes home; a new password leaves the session anonymous (every session fell on the server).
 *
 *  Example: `fetcher.submit({ intent: 'inspect-invitation', token }, { method: 'post', encType: 'application/json' })` */
export function accountLinksAction(deps: AppDependencies): ActionFunction {
  return async ({ request }): Promise<AccountLinksActionResult | Response> => {
    const parsed = linksIntentDto.safeParse(await request.json());
    if (!parsed.success) return { intent: null, failure: { kind: 'invalid' } };
    return run(deps, parsed.data);
  };
}

async function run(
  { accountLinksApi: api, sessionStore }: AppDependencies,
  input: z.infer<typeof linksIntentDto>,
): Promise<AccountLinksActionResult | Response> {
  switch (input.intent) {
    case 'inspect-invitation': {
      const result = await api.inspectInvitation(input.token);
      return result.ok
        ? { intent: input.intent, invitation: result.value }
        : { intent: input.intent, failure: result.failure };
    }
    case 'accept': {
      const { token, username, password, persistent, acceptedTerms } = input;
      const acceptance = { token, username, password, persistent, acceptedTerms };
      const result = await api.acceptInvitation(acceptance);
      if (!result.ok) return { intent: input.intent, failure: result.failure };
      sessionStore.getState().signedIn(result.value);
      return redirect('/');
    }
    case 'inspect-reset': {
      const result = await api.inspectPasswordReset(input.token);
      return result.ok
        ? { intent: input.intent, username: result.value }
        : { intent: input.intent, failure: result.failure };
    }
    case 'complete-reset': {
      const result = await api.completePasswordReset(input.token, input.newPassword);
      if (!result.ok) return { intent: input.intent, failure: result.failure };
      sessionStore.getState().signedOut();
      return { intent: input.intent, done: true };
    }
  }
}
