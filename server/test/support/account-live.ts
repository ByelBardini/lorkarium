import { meResponseDto } from '@lorkarium/contracts';
import { expect } from 'vitest';
import type { RecordedEvent, EventRecorder, RealtimeClient } from './realtime-client';
import type { SignedInUser } from './sign-in';
import type { TokenTableHarness } from './token-table';

type Emit = (event: string, ...args: unknown[]) => Promise<unknown>;

/** `a` asks `b` and `b` accepts, over the real HTTP edge: the two are friends.
 *
 *  Example: `await befriend(live, live.ana, live.bia)` */
export async function befriend(
  live: TokenTableHarness,
  a: SignedInUser,
  b: SignedInUser,
): Promise<void> {
  const asked = await live.http(a, {
    method: 'POST',
    url: '/api/friends/requests',
    payload: { username: await usernameOf(live, b) },
  });
  expect(asked.statusCode).toBe(200);
  const accepted = await live.http(b, {
    method: 'POST',
    url: `/api/friends/requests/${a.id}/accept`,
  });
  expect(accepted.statusCode).toBe(200);
}

async function usernameOf(live: TokenTableHarness, user: SignedInUser): Promise<string> {
  const response = await live.http(user, { method: 'GET', url: '/api/auth/me' });
  const { user: me } = meResponseDto.parse(response.json());
  if (!me) throw new Error(`no session for ${user.id}; expected a signed-in account`);
  return me.username;
}

/** Emits `event` (with `payload`, or the ack alone when `undefined`) and resolves the raw ack. */
export async function ackOf(
  client: RealtimeClient,
  event: string,
  payload?: unknown,
): Promise<unknown> {
  const timed = client.timeout(4000);
  const emit = timed.emitWithAck as Emit;
  return payload === undefined ? emit.call(timed, event) : emit.call(timed, event, payload);
}

/** The first `name` event whose payload passes `matches`; waits up to 2 s for it. */
export async function eventMatching(
  recorder: EventRecorder,
  name: string,
  matches: (payload: unknown) => boolean = () => true,
): Promise<unknown> {
  const deadline = Date.now() + 2000;
  for (;;) {
    const found = recorder.events.find((event) => event.name === name && matches(event.payload));
    if (found) return found.payload;
    if (Date.now() > deadline) {
      throw new Error(`no matching ${name}; got ${JSON.stringify(recorder.events)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Every recorded payload of `name`, in order. */
export function payloadsOf(recorder: EventRecorder, name: string): unknown[] {
  return recorder.events
    .filter((event: RecordedEvent) => event.name === name)
    .map((event) => event.payload);
}
