import { confirmEmailRequestDto } from '@lorkarium/contracts';
import type { ActionFunction } from 'react-router';
import type { AppDependencies } from '@/app/router';
import type { AccountSecurityFailure } from '@/services/account-security-api';

export type EmailConfirmResult =
  Readonly<{ confirmed: true }> | Readonly<{ failure: AccountSecurityFailure }>;

/** Confirms the e-mail change with the token of the link (public: no session needed). A browser
 *  that is signed in reads the account again, so the menu shows the new address.
 *
 *  Example: `fetcher.submit({ token }, { method: 'post', encType: 'application/json' })` */
export function emailConfirmAction({
  accountSecurityApi,
  authApi,
  sessionStore,
}: AppDependencies): ActionFunction {
  return async ({ request }): Promise<EmailConfirmResult> => {
    const parsed = confirmEmailRequestDto.safeParse(await request.json());
    if (!parsed.success) return { failure: { kind: 'email_token_invalid' } };
    const result = await accountSecurityApi.confirmEmail(parsed.data);
    if (!result.ok) return { failure: result.failure };
    if (sessionStore.getState().session.status !== 'authenticated') return { confirmed: true };
    const me = await authApi.me();
    if (me.ok && me.value) sessionStore.getState().signedIn(me.value);
    return { confirmed: true };
  };
}
