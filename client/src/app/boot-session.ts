import type { AuthUserDto } from '@lorkarium/contracts';
import type { AuthApi } from '@/services/auth-api';

// From 1 s, doubling up to 10 s: a deploy swaps the server within seconds, and a dropped network
// takes longer and needs no hammering.
const FIRST_RETRY_MS = 1000;
const LONGEST_RETRY_MS = 10_000;

/** Resolves after `ms`; `setTimeout` in the app, a fake in tests. */
export type WaitBeforeRetry = (ms: number) => Promise<void>;

/** The pause before asking again, after `failures` unanswered tries in a row.
 *
 *  Example: `bootRetryDelayMs(3) // 8000` */
export function bootRetryDelayMs(failures: number): number {
  return Math.min(FIRST_RETRY_MS * 2 ** (failures - 1), LONGEST_RETRY_MS);
}

/** The signed-in user (or `null`) as the server itself answers it. No answer, or a broken one (a
 *  deploy, the proxy's 502, no network), is asked again after a pause and never read as signed
 *  out: that would leave a remembered session on the login screen.
 *
 *  Example: `await whoAmIOnceAnswered(authApi, () => store.getState().serverUnreachable(), wait)` */
export async function whoAmIOnceAnswered(
  authApi: Pick<AuthApi, 'me'>,
  onUnanswered: () => void,
  waitBeforeRetry: WaitBeforeRetry,
): Promise<AuthUserDto | null> {
  for (let failures = 1; ; failures += 1) {
    const answer = await authApi.me();
    if (answer.ok) return answer.value;
    onUnanswered();
    await waitBeforeRetry(bootRetryDelayMs(failures));
  }
}
