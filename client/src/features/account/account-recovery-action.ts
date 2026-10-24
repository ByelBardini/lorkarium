import { accountRecoveryRequestDto, accountRecoveryTokenDto } from '@lorkarium/contracts';
import type { ActionFunction } from 'react-router';
import { z } from 'zod';
import type { AppDependencies } from '@/app/router';
import type { AccountRecoveryView, AccountSecurityFailure } from '@/services/account-security-api';

const recoveryIntentDto = z.discriminatedUnion('intent', [
  accountRecoveryTokenDto.extend({ intent: z.literal('check') }),
  accountRecoveryRequestDto.extend({ intent: z.literal('recover') }),
]);

export type AccountRecoveryIntent = z.input<typeof recoveryIntentDto>;

export type AccountRecoveryResult =
  | Readonly<{ intent: 'check'; recovery: AccountRecoveryView }>
  | Readonly<{ intent: 'recover'; recovered: true }>
  | Readonly<{ intent: 'check' | 'recover'; failure: AccountSecurityFailure }>;

/** The "Não fui eu" page's two requests (public): what the link does, and doing it. After a
 *  recovery every session of the account is gone, this browser's too, so the session goes
 *  anonymous here.
 *
 *  Example: `fetcher.submit({ intent: 'check', token }, { method: 'post', encType: 'application/json' })` */
export function accountRecoveryAction({
  accountSecurityApi,
  sessionStore,
}: AppDependencies): ActionFunction {
  return async ({ request }): Promise<AccountRecoveryResult> => {
    const parsed = recoveryIntentDto.safeParse(await request.json());
    if (!parsed.success) return { intent: 'recover', failure: { kind: 'invalid' } };
    const input = parsed.data;
    if (input.intent === 'check') {
      const checked = await accountSecurityApi.checkRecovery(input.token);
      return checked.ok
        ? { intent: 'check', recovery: checked.value }
        : { intent: 'check', failure: checked.failure };
    }
    const recovered = await accountSecurityApi.recover(input.token, input.newPassword);
    if (!recovered.ok) return { intent: 'recover', failure: recovered.failure };
    sessionStore.getState().signedOut();
    return { intent: 'recover', recovered: true };
  };
}
