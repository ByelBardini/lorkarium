import { useEffect, useEffectEvent } from 'react';
import { useFetcher } from 'react-router';
import type { UserAdminFailure } from '@/services/user-admin-api';
import type { UsersActionResult, UsersIntent } from './users-action';

export type UsersFetcher = Readonly<{
  /** True from the submit until the list has been reloaded. */
  busy: boolean;
  /** The answer, once the reload after it is done (the table already shows the change). */
  settled: UsersActionResult | undefined;
  send: (intent: UsersIntent) => void;
  /** Forgets the answer (back to the empty form). */
  reset: () => void;
}>;

/** One command of the users page sent to its action, without navigation.
 *
 *  Example: `const fetcher = useUsersFetcher(); fetcher.send({ intent: 'suspend', userId })` */
export function useUsersFetcher(): UsersFetcher {
  const fetcher = useFetcher<UsersActionResult>();
  const send = (intent: UsersIntent): void => {
    void fetcher.submit(intent, {
      method: 'post',
      action: '/admin/users',
      encType: 'application/json',
    });
  };
  return {
    busy: fetcher.state !== 'idle',
    settled: fetcher.state === 'idle' ? fetcher.data : undefined,
    send,
    reset: () => fetcher.reset(),
  };
}

/** Runs `react` once per new answer, after the render that shows it.
 *
 *  Example: `useOnUsersSettled(fetcher.settled, (result) => { if ('user' in result) onClose() })` */
export function useOnUsersSettled(
  settled: UsersActionResult | undefined,
  react: (result: UsersActionResult) => void,
): void {
  const onSettled = useEffectEvent(react);
  useEffect(() => {
    if (settled) onSettled(settled);
  }, [settled]);
}

/** The refusal in a settled answer, or `null`. */
export function usersFailureOf(settled: UsersActionResult | undefined): UserAdminFailure | null {
  return settled && 'failure' in settled ? settled.failure : null;
}
