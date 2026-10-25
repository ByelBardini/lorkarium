import { describe, expect, it } from 'vitest';
import { bootRetryDelayMs, whoAmIOnceAnswered } from '@/app/boot-session';
import { ANA, AuthApiFake } from '../support/auth-api-fake';
import { RetryWaitFake } from '../support/retry-wait-fake';

describe('bootRetryDelayMs', () => {
  it.each([
    [1, 1000],
    [2, 2000],
    [3, 4000],
    [4, 8000],
    [5, 10_000],
    [40, 10_000],
  ])('after %i unanswered tries it waits %i ms', (failures, ms) => {
    expect(bootRetryDelayMs(failures)).toBe(ms);
  });
});

describe('whoAmIOnceAnswered', () => {
  it('the first answer of the server is the result, with no pause and no unreachable call', async () => {
    const api = new AuthApiFake().answerMeWith(ANA);
    const waits = RetryWaitFake.instant();
    let unanswered = 0;
    expect(await whoAmIOnceAnswered(api, () => (unanswered += 1), waits.wait)).toEqual(ANA);
    expect([api.meCalls, unanswered, waits.waited]).toEqual([1, 0, []]);
  });

  it('"no session" from the server is an answer too: null, without asking again', async () => {
    const api = new AuthApiFake().answerMeWith(null);
    const waits = RetryWaitFake.instant();
    expect(await whoAmIOnceAnswered(api, () => undefined, waits.wait)).toBeNull();
    expect(api.meCalls).toBe(1);
  });

  it('offline and broken answers are asked again after growing pauses, each one reported', async () => {
    const api = new AuthApiFake()
      .failMeWith({ kind: 'offline' }, { kind: 'unexpected' }, { kind: 'offline' })
      .answerMeWith(ANA);
    const waits = RetryWaitFake.instant();
    let unanswered = 0;
    expect(await whoAmIOnceAnswered(api, () => (unanswered += 1), waits.wait)).toEqual(ANA);
    expect(waits.waited).toEqual([1000, 2000, 4000]);
    expect([api.meCalls, unanswered]).toEqual([4, 3]);
  });

  it('does not ask again before the pause ends', async () => {
    const api = new AuthApiFake().failMeWith({ kind: 'offline' }).answerMeWith(ANA);
    const waits = RetryWaitFake.held();
    const user = whoAmIOnceAnswered(api, () => undefined, waits.wait);
    await Promise.resolve();
    await Promise.resolve();
    expect(api.meCalls).toBe(1);
    waits.release();
    expect(await user).toEqual(ANA);
    expect(api.meCalls).toBe(2);
  });
});
