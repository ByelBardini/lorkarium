import {
  boardCommandAckDto,
  boardSyncAckDto,
  sessionJoinAckDto,
  type BoardCommandAckDto,
  type BoardStateDto,
} from '@lorkarium/contracts';
import { connectRealtime, type EventRecorder, type RealtimeClient } from './realtime-client';
import type { SignedInUser } from './sign-in';
import type { Table } from './tables';

type Emit = (event: string, payload: object) => Promise<unknown>;

/** The fields every board command carries. */
export function envelope(campaignId: string): { actionId: string; campaignId: string } {
  return { actionId: crypto.randomUUID(), campaignId };
}

/** Connects `user` and joins `table` through `session:join`; the client is kept in `clients`
 *  so the spec closes it.
 *
 *  Example: `const bia = await atTable(baseUrl, clients, biaUser, vharn)` */
export async function atTable(
  baseUrl: string,
  clients: RealtimeClient[],
  user: SignedInUser,
  table: Pick<Table, 'id'>,
): Promise<RealtimeClient> {
  const client = await connectRealtime(baseUrl, { token: user.token });
  clients.push(client);
  const ack = sessionJoinAckDto.parse(
    await client.timeout(2000).emitWithAck('session:join', envelope(table.id)),
  );
  if (!ack.ok) throw new Error(`join of ${table.id} refused with ${ack.error.code}`);
  return client;
}

/** Sends any board command (forged payloads too) and parses the ack.
 *
 *  Example: `expect(await send(ana, 'token:create', payload)).toEqual({ ok: true, version: 1 })` */
export async function send(
  client: RealtimeClient,
  event: string,
  payload: object,
): Promise<BoardCommandAckDto> {
  const timed = client.timeout(2000);
  const emit = timed.emitWithAck as Emit;
  return boardCommandAckDto.parse(await emit.call(timed, event, payload));
}

/** The board as `client` may see it, by `board:sync`. */
export async function synced(
  client: RealtimeClient,
  table: Pick<Table, 'id'>,
): Promise<BoardStateDto> {
  const ack = boardSyncAckDto.parse(
    await client.timeout(2000).emitWithAck('board:sync', envelope(table.id)),
  );
  if (!ack.ok) throw new Error(`sync refused with ${ack.error.code}`);
  return ack.state;
}

/** The payload of the first `name` event the recorder got; waits up to 2 s for it. */
export async function eventPayload(recorder: EventRecorder, name: string): Promise<unknown> {
  const deadline = Date.now() + 2000;
  for (;;) {
    const found = recorder.events.find((event) => event.name === name);
    if (found) return found.payload;
    if (Date.now() > deadline) {
      throw new Error(`no ${name}; got ${JSON.stringify(recorder.events.map((e) => e.name))}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Long enough for an event already emitted to arrive on localhost. */
export async function silence(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 300));
}
