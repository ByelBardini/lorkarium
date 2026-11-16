import { useEffect, useEffectEvent } from 'react';
import { useFetcher } from 'react-router';
import type { BadgesAdminFailure } from '@/services/badges-admin-api';
import type { BadgesActionResult, BadgesIntent } from './badges-action';

export type BadgesFetcher = Readonly<{
  /** True from the submit until the catalog has been reloaded. */
  busy: boolean;
  /** The answer, once the reload after it is done (the list already shows the change). */
  settled: BadgesActionResult | undefined;
  send: (intent: BadgesIntent) => void;
}>;

/** One command of the badge catalog sent to its action, without navigation.
 *
 *  Example: `const fetcher = useBadgesFetcher(); fetcher.send({ intent: 'delete', badgeId })` */
export function useBadgesFetcher(): BadgesFetcher {
  const fetcher = useFetcher<BadgesActionResult>();
  const send = (intent: BadgesIntent): void => {
    void fetcher.submit(intent, {
      method: 'post',
      action: '/admin/badges',
      encType: 'application/json',
    });
  };
  return {
    busy: fetcher.state !== 'idle',
    settled: fetcher.state === 'idle' ? fetcher.data : undefined,
    send,
  };
}

/** Runs `react` once per new answer, after the render that shows it.
 *
 *  Example: `useOnBadgesSettled(fetcher.settled, (result) => { if ('badge' in result) close() })` */
export function useOnBadgesSettled(
  settled: BadgesActionResult | undefined,
  react: (result: BadgesActionResult) => void,
): void {
  const onSettled = useEffectEvent(react);
  useEffect(() => {
    if (settled) onSettled(settled);
  }, [settled]);
}

/** The refusal in a settled answer, or `null`. */
export function badgesFailureOf(
  settled: BadgesActionResult | undefined,
): BadgesAdminFailure | null {
  return settled && 'failure' in settled ? settled.failure : null;
}
