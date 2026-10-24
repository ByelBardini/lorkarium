import { sceneUnwatchAckDto, sceneUpdatedDto, type SceneUnwatchAckDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { gridAck, newGrid, setGridVisibility } from '../support/grids';
import { envelope, eventPayload, send, silence } from '../support/live-table';
import {
  recordEventsOf,
  type EventRecorder,
  type RealtimeClient,
} from '../support/realtime-client';
import type { Table } from '../support/tables';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();

const GRID_30_BY_20 = {
  widthCells: 30,
  heightCells: 20,
  cellDistance: 1.5,
  cellUnit: 'm',
  gridVisible: true,
  gridOpacity: 15,
};

type Emit = (event: string, payload: object) => Promise<unknown>;

function configureOf(table: Table, sceneId?: string): object {
  return { ...envelope(table.id), ...GRID_30_BY_20, ...(sceneId ? { sceneId } : {}) };
}

async function unwatch(client: RealtimeClient, sceneId: string): Promise<SceneUnwatchAckDto> {
  const timed = client.timeout(2000);
  const emit = timed.emitWithAck as Emit;
  const payload = { ...envelope(live.vharn.id), sceneId };
  return sceneUnwatchAckDto.parse(await emit.call(timed, 'scene:unwatch', payload));
}

function sceneUpdatesOf(recorder: EventRecorder): string[] {
  return recorder.events
    .filter(({ name }) => name === 'scene:updated')
    .map(({ payload }) => sceneUpdatedDto.parse(payload).scene.id);
}

async function threeAtVharn(): Promise<[RealtimeClient, RealtimeClient, RealtimeClient]> {
  return [
    await live.atTable(live.ana, live.vharn),
    await live.atTable(live.bia, live.vharn),
    await live.atTable(live.caio, live.vharn),
  ];
}

describe('the rooms of each grid', () => {
  it('after session:join, Ana, Bia and Caio are in the group grid rooms and get its scene:updated', async () => {
    const [ana, bia, caio] = await threeAtVharn();
    const recorders = [ana, bia, caio].map(recordEventsOf);

    await send(ana, 'scene:configure', configureOf(live.vharn));

    for (const recorder of recorders) await eventPayload(recorder, 'scene:updated');
    const group = await groupGridOf();
    expect(recorders.map(sceneUpdatesOf)).toEqual([[group], [group], [group]]);
  });

  it('Ana configures the private Torre she did not open as a tab and nobody hears it', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    const recorders = (await threeAtVharn()).map(recordEventsOf);

    expect(
      await send(recorders[0]!.client, 'scene:configure', configureOf(live.vharn, torre)),
    ).toMatchObject({ ok: true });

    await silence();
    expect(recorders.map(sceneUpdatesOf)).toEqual([[], [], []]);
  });

  it('Ana watches the Torre: the ack has its snapshot and its next scene:updated reaches only her', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    const [ana, bia, caio] = await threeAtVharn();
    const [anaEvents, biaEvents, caioEvents] = [ana, bia, caio].map(recordEventsOf);

    const ack = await gridAck(ana, 'scene:watch', live.vharn, torre);
    await send(ana, 'scene:configure', configureOf(live.vharn, torre));

    expect(ack).toMatchObject({ ok: true, state: { scene: { id: torre, name: 'Torre' } } });
    await eventPayload(anaEvents!, 'scene:updated');
    await silence();
    expect(sceneUpdatesOf(anaEvents!)).toEqual([torre]);
    expect([sceneUpdatesOf(biaEvents!), sceneUpdatesOf(caioEvents!)]).toEqual([[], []]);
  });

  it('Bia watching the private Torre is SCENE_NOT_FOUND and hears nothing of it', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    const [ana, bia] = await threeAtVharn();
    const biaEvents = recordEventsOf(bia);

    const ack = await gridAck(bia, 'scene:watch', live.vharn, torre);
    await send(ana, 'scene:configure', configureOf(live.vharn, torre));

    expect(ack).toEqual({
      ok: false,
      error: { code: 'SCENE_NOT_FOUND', message: 'Scene not found' },
    });
    await silence();
    expect(sceneUpdatesOf(biaEvents)).toEqual([]);
  });

  it('once the Torre is public, Bia watches it as a tab and gets its scene:updated', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    await setGridVisibility(live, live.ana, live.vharn, torre, 'public');
    const [ana, bia, caio] = await threeAtVharn();
    const [biaEvents, caioEvents] = [bia, caio].map(recordEventsOf);

    expect(await gridAck(bia, 'scene:watch', live.vharn, torre)).toMatchObject({ ok: true });
    await send(ana, 'scene:configure', configureOf(live.vharn, torre));

    await eventPayload(biaEvents!, 'scene:updated');
    expect(sceneUpdatesOf(biaEvents!)).toEqual([torre]);
    expect(sceneUpdatesOf(caioEvents!)).toEqual([]);
  });

  it('scene:unwatch of the Torre answers ok and its events stop arriving', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    const ana = await live.atTable(live.ana, live.vharn);
    const anaEvents = recordEventsOf(ana);
    await gridAck(ana, 'scene:watch', live.vharn, torre);

    expect(await unwatch(ana, torre)).toEqual({ ok: true });
    await send(ana, 'scene:configure', configureOf(live.vharn, torre));

    await silence();
    expect(sceneUpdatesOf(anaEvents)).toEqual([]);
  });

  it('scene:unwatch of the group grid keeps its events arriving: it is not a tab to close', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const anaEvents = recordEventsOf(ana);
    const group = await gridAck(ana, 'scene:watch', live.vharn, await groupGridOf());

    expect(await unwatch(ana, group.ok ? group.state.scene.id : '')).toEqual({ ok: true });
    await send(ana, 'scene:configure', configureOf(live.vharn));

    await eventPayload(anaEvents, 'scene:updated');
    expect(sceneUpdatesOf(anaEvents)).toEqual([await groupGridOf()]);
  });

  it('a new connection is in no extra grid room until it watches again', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    const first = await live.atTable(live.ana, live.vharn);
    await gridAck(first, 'scene:watch', live.vharn, torre);
    first.close();
    const again = await live.atTable(live.ana, live.vharn);
    const againEvents = recordEventsOf(again);

    await send(again, 'scene:configure', configureOf(live.vharn, torre));
    await silence();
    expect(sceneUpdatesOf(againEvents)).toEqual([]);

    await gridAck(again, 'scene:watch', live.vharn, torre);
    await send(again, 'scene:configure', configureOf(live.vharn, torre));
    await eventPayload(againEvents, 'scene:updated');
    expect(sceneUpdatesOf(againEvents)).toEqual([torre]);
  });

  it('after session:leave the group grid and the watched Torre are silent for that connection', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    const [ana, bia] = await threeAtVharn();
    const biaEvents = recordEventsOf(bia);
    await setGridVisibility(live, live.ana, live.vharn, torre, 'public');
    await gridAck(bia, 'scene:watch', live.vharn, torre);

    await bia.timeout(2000).emitWithAck('session:leave', envelope(live.vharn.id));
    await send(ana, 'scene:configure', configureOf(live.vharn));
    await send(ana, 'scene:configure', configureOf(live.vharn, torre));

    await silence();
    expect(sceneUpdatesOf(biaEvents)).toEqual([]);
  });

  it("a socket at Vharn never hears Quelm's Torre, and cannot watch it through either table", async () => {
    const quelmTorre = await newGrid(live, live.caio, live.quelm, 'Torre da Quelm');
    await setGridVisibility(live, live.caio, live.quelm, quelmTorre, 'public');
    const ana = await live.atTable(live.ana, live.vharn);
    const anaEvents = recordEventsOf(ana);
    const caio = await live.atTable(live.caio, live.quelm);
    await gridAck(caio, 'scene:watch', live.quelm, quelmTorre);

    const throughVharn = await gridAck(ana, 'scene:watch', live.vharn, quelmTorre);
    const throughQuelm = await gridAck(ana, 'scene:watch', live.quelm, quelmTorre);
    await send(caio, 'scene:configure', configureOf(live.quelm, quelmTorre));

    expect(throughVharn).toMatchObject({ ok: false, error: { code: 'SCENE_NOT_FOUND' } });
    expect(throughQuelm).toMatchObject({ ok: false, error: { code: 'CAMPAIGN_NOT_FOUND' } });
    await silence();
    expect(sceneUpdatesOf(anaEvents)).toEqual([]);
  });

  // A7's race, decided by the share lock of the watch and the eviction of the PATCH (A10). Each
  // connection sends at most 35 commands, under the burst of the rate limit.
  it('100 times, a watch by Bia racing a PATCH private of the Torre ends with no Torre event reaching her', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    const anas = [0, 1, 2].map(() => live.atTable(live.ana, live.vharn));
    const anaEvents = (await Promise.all(anas)).map(recordEventsOf);
    for (const { client } of anaEvents) await gridAck(client, 'scene:watch', live.vharn, torre);
    const bias = [0, 1, 2].map(() => live.atTable(live.bia, live.vharn));
    const biaEvents = (await Promise.all(bias)).map(recordEventsOf);

    for (let round = 0; round < RACE_ROUNDS; round += 1) {
      await setGridVisibility(live, live.ana, live.vharn, torre, 'public');
      const bia = biaEvents[round % 3]!.client;
      await Promise.all([
        gridAck(bia, 'scene:watch', live.vharn, torre),
        setGridVisibility(live, live.ana, live.vharn, torre, 'private'),
      ]);
      await send(anaEvents[round % 3]!.client, 'scene:configure', configureOf(live.vharn, torre));
      await untilTorreUpdates(anaEvents, torre, 3 * (round + 1));
    }

    await silence();
    expect(biaEvents.flatMap(sceneUpdatesOf)).toEqual([]);
  }, 60_000);

  it('a scene:watch with a forged userId is INVALID_BODY', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    const bia = await live.atTable(live.bia, live.vharn);
    const timed = bia.timeout(2000);
    const emit = timed.emitWithAck as Emit;

    const forged = { ...envelope(live.vharn.id), sceneId: torre, userId: live.ana.id };
    const ack = await emit.call(timed, 'scene:watch', forged);

    expect(ack).toMatchObject({ ok: false, error: { code: 'INVALID_BODY' } });
  });
});

const RACE_ROUNDS = 100;

// Waits until the recorders together heard `count` scene:updated of `sceneId`.
async function untilTorreUpdates(
  recorders: readonly EventRecorder[],
  sceneId: string,
  count: number,
): Promise<void> {
  const deadline = Date.now() + 2000;
  const heard = (): number =>
    recorders.flatMap(sceneUpdatesOf).filter((id) => id === sceneId).length;
  while (heard() < count) {
    if (Date.now() > deadline)
      throw new Error(`heard ${heard()} updates of ${sceneId}; expected ${count}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function groupGridOf(): Promise<string> {
  const url = `/api/campaigns/${live.vharn.id}/scenes`;
  const library = await live.http(live.ana, { method: 'GET', url });
  return String(library.json().activeSceneId);
}
