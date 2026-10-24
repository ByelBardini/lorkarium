import { boardPingedDto, pingAckDto, type PingAckDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { gridAck, newGrid } from '../support/grids';
import { envelope, eventPayload, silence, synced } from '../support/live-table';
import {
  recordEventsOf,
  type EventRecorder,
  type RealtimeClient,
} from '../support/realtime-client';
import type { Table } from '../support/tables';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();

type Emit = (event: string, payload: object) => Promise<unknown>;

async function ping(client: RealtimeClient, payload: object): Promise<PingAckDto> {
  const timed = client.timeout(2000);
  const emit = timed.emitWithAck as Emit;
  return pingAckDto.parse(await emit.call(timed, 'board:ping', payload));
}

function pingOf(table: Table, sceneId: string, x = 3.42, y = 1.5): object {
  return { ...envelope(table.id), sceneId, x, y };
}

function pingsHeard(recorder: EventRecorder): Array<{ userId: string; x: number; y: number }> {
  return recorder.events
    .filter(({ name }) => name === 'board:pinged')
    .map(({ payload }) => boardPingedDto.parse(payload))
    .map(({ userId, x, y }) => ({ userId, x, y }));
}

async function groupGridOf(client: RealtimeClient): Promise<string> {
  return (await synced(client, live.vharn)).scene.id;
}

describe('board:ping', () => {
  it('Ana pings the group grid: Bia and Caio get it with her id, Ana only gets the ack', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const [anaEvents, biaEvents, caioEvents] = [
      ana,
      await live.atTable(live.bia, live.vharn),
      await live.atTable(live.caio, live.vharn),
    ].map(recordEventsOf);

    const ack = await ping(ana, pingOf(live.vharn, await groupGridOf(ana)));

    expect(ack).toEqual({ ok: true });
    await eventPayload(biaEvents!, 'board:pinged');
    await eventPayload(caioEvents!, 'board:pinged');
    const expected = [{ userId: live.ana.id, x: 3.42, y: 1.5 }];
    expect([pingsHeard(biaEvents!), pingsHeard(caioEvents!)]).toEqual([expected, expected]);
    await silence();
    expect(pingsHeard(anaEvents!)).toEqual([]);
  });

  it("Ana pings the private Torre: her other connection with it open hears it, Bia doesn't", async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    const ana = await live.atTable(live.ana, live.vharn);
    const anaElsewhere = await live.atTable(live.ana, live.vharn);
    await gridAck(ana, 'scene:watch', live.vharn, torre);
    await gridAck(anaElsewhere, 'scene:watch', live.vharn, torre);
    const [elsewhereEvents, biaEvents] = [
      anaElsewhere,
      await live.atTable(live.bia, live.vharn),
    ].map(recordEventsOf);

    expect(await ping(ana, pingOf(live.vharn, torre))).toEqual({ ok: true });

    await eventPayload(elsewhereEvents!, 'board:pinged');
    await silence();
    expect(pingsHeard(biaEvents!)).toEqual([]);
  });

  it('Bia pinging the private Torre is SCENE_NOT_FOUND and nobody hears it', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    const ana = await live.atTable(live.ana, live.vharn);
    await gridAck(ana, 'scene:watch', live.vharn, torre);
    const anaEvents = recordEventsOf(ana);
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await ping(bia, pingOf(live.vharn, torre));

    expect(ack).toEqual({
      ok: false,
      error: { code: 'SCENE_NOT_FOUND', message: 'Scene not found' },
    });
    await silence();
    expect(pingsHeard(anaEvents)).toEqual([]);
  });

  it('a ping to a table not open on the connection is CAMPAIGN_NOT_FOUND', async () => {
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await ping(bia, pingOf(live.quelm, crypto.randomUUID()));

    expect(ack).toMatchObject({ ok: false, error: { code: 'CAMPAIGN_NOT_FOUND' } });
  });

  it.each([
    ['a forged userId', { userId: '7d0f8c39-2b8e-4f4e-9d1a-5c6b7a8e9f01' }],
    ['x past the grid ceiling', { x: 100.5 }],
  ])('a ping with %s is INVALID_BODY', async (_case, extra) => {
    const ana = await live.atTable(live.ana, live.vharn);
    const payload = { ...pingOf(live.vharn, await groupGridOf(ana)), ...extra };

    expect(await ping(ana, payload)).toMatchObject({ ok: false, error: { code: 'INVALID_BODY' } });
  });

  it('who is at Quelm hears nothing of a ping at Vharn (critério 14)', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const quelmEvents = recordEventsOf(await live.atTable(live.caio, live.quelm));

    expect(await ping(ana, pingOf(live.vharn, await groupGridOf(ana)))).toEqual({ ok: true });

    await silence();
    expect(pingsHeard(quelmEvents)).toEqual([]);
  });

  it('five pings leave the grid at the version it had: nothing is written', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const before = await synced(ana, live.vharn);

    for (let index = 0; index < 5; index += 1) {
      await ping(ana, pingOf(live.vharn, before.scene.id, index, index));
    }

    expect((await synced(ana, live.vharn)).version).toBe(before.version);
  });

  // The session:join and the sync of the grid id drew two commands of the same bucket.
  it('the 39th ping of a burst gets RATE_LIMITED', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const payload = pingOf(live.vharn, await groupGridOf(ana));

    const acks = await Promise.all(Array.from({ length: 39 }, () => ping(ana, payload)));

    expect(acks.slice(0, 38).every((ack) => ack.ok)).toBe(true);
    expect(acks[38]).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  });
});
