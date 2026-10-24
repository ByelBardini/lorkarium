import { useEffect, useEffectEvent } from 'react';
import { useFetcher } from 'react-router';
import type { AccountActionRequest, AccountActionResult } from './account-action';
import type { AccountFailure } from './account-messages';

export type AccountFetcher = Readonly<{
  /** True from the submit until the account has been reloaded. */
  busy: boolean;
  /** The answer, once the reload after it is done (so the screen already shows the new account). */
  settled: AccountActionResult | undefined;
  send: (request: AccountActionRequest) => void;
}>;

/** One command of "Minha conta" sent to the account action, without navigation.
 *
 *  Example: `const fetcher = useAccountFetcher(); fetcher.send({ intent: 'email-cancel' })` */
export function useAccountFetcher(): AccountFetcher {
  const fetcher = useFetcher<AccountActionResult>();
  const send = (request: AccountActionRequest): void => {
    void fetcher.submit(request, {
      method: 'post',
      action: '/account',
      encType: 'application/json',
    });
  };
  return {
    busy: fetcher.state !== 'idle',
    settled: fetcher.state === 'idle' ? fetcher.data : undefined,
    send,
  };
}

/** Runs `react` once per new answer, after the render that shows it (it may close a dialog or
 *  write a notice in the parent).
 *
 *  Example: `useOnSettled(fetcher.settled, (result) => { if ('done' in result) onClose() })` */
export function useOnSettled(
  settled: AccountActionResult | undefined,
  react: (result: AccountActionResult) => void,
): void {
  const onSettled = useEffectEvent(react);
  useEffect(() => {
    if (settled) onSettled(settled);
  }, [settled]);
}

/** The refusal in a settled answer, or `null` (none yet, or it went through).
 *
 *  Example: `const failure = failureOf(fetcher.settled)` */
export function failureOf(settled: AccountActionResult | undefined): AccountFailure | null {
  return settled && 'failure' in settled ? settled.failure : null;
}
