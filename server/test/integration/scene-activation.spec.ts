import { sceneActivatedDto, sceneClosedDto, sceneUpdatedDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { castIdOf } from '../support/characters';
import { activateGrid, gridAck, newGrid, setGridVisibility } from '../support/grids';
import { envelope, eventPayload, send, silence } from '../support/live-table';
import {
  recordEventsOf,
  type EventRecorder,
  type RealtimeClient,
} from '../support/realtime-client';
import type { Table } from '../support/tables';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

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

function configureOf(sceneId: string): object {
  return { ...envelope(live.vharn.id), ...GRID_30_BY_20, sceneId };
}

function namesOf(recorder: EventRecorder, name: string): unknown[] {
  return recorder.events.filter((event) => event.name === name).map((event) => event.payload);
}

function sceneUpdatesOf(recorder: EventRecorder): string[] {
  return namesOf(recorder, 'scene:updated').map(
    (payload) => sceneUpdatedDto.parse(payload).sceneId ?? '',
  );
}

async function groupGridOf(table: Table = live.vharn): Promise<string> {
  const url = `/api/campaigns/${table.id}/scenes`;
  const library = await live.http(live.ana, { method: 'GET', url });
  return String(library.json().activeSceneId);
}

async function threeAtVharn(): Promise<[RealtimeClient, RealtimeClient, RealtimeClient]> {
  return [
    await live.atTable(live.ana, live.vharn),
    await live.atTable(live.bia, live.vharn),
    await live.atTable(live.caio, live.vharn),
  ];
}

describe('taking the group to another grid (scene:activate)', () => {
  it('Ana takes the group to the Estrada: all three get scene:activated and its next token:moved', async () => {
    const salao = await groupGridOf();
    const estrada = await newGrid(live, live.ana, live.vharn, 'Estrada de Vharn');
    const [ana, bia, caio] = await threeAtVharn();
    const recorders = [ana, bia, caio].map(recordEventsOf);

    expect(await activateGrid(ana, live.vharn, estrada)).toEqual({ ok: true });
    await send(ana, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
    const lyra = await createdTokenOf(recorders[0]!);
    await send(ana, 'token:move', { ...envelope(live.vharn.id), tokenId: lyra.id, col: 5, row: 5 });

    for (const recorder of recorders) {
      const activated = sceneActivatedDto.parse(await eventPayload(recorder, 'scene:activated'));
      expect(activated).toMatchObject({ sceneId: estrada, previousSceneId: salao });
      expect(await eventPayload(recorder, 'token:moved')).toMatchObject({ sceneId: estrada });
    }
  });

  it('the private Salão stops reaching Bia and Caio, and Ana who did not open it as a tab', async () => {
    const salao = await groupGridOf();
    const estrada = await newGrid(live, live.ana, live.vharn, 'Estrada de Vharn');
    const [ana, bia, caio] = await threeAtVharn();
    const recorders = [ana, bia, caio].map(recordEventsOf);

    await activateGrid(ana, live.vharn, estrada);
    expect(await send(ana, 'scene:configure', configureOf(salao))).toMatchObject({ ok: true });

    await silence();
    expect(recorders.map(sceneUpdatesOf)).toEqual([[], [], []]);
  });

  it('the public Salão Bia opened as a tab keeps reaching her, and only her', async () => {
    const salao = await groupGridOf();
    await setGridVisibility(live, live.ana, live.vharn, salao, 'public');
    const estrada = await newGrid(live, live.ana, live.vharn, 'Estrada de Vharn');
    const [ana, bia, caio] = await threeAtVharn();
    const [biaEvents, caioEvents] = [bia, caio].map(recordEventsOf);
    await gridAck(bia, 'scene:watch', live.vharn, salao);

    await activateGrid(ana, live.vharn, estrada);
    await send(ana, 'scene:configure', configureOf(salao));

    await eventPayload(biaEvents!, 'scene:updated');
    expect(sceneUpdatesOf(biaEvents!)).toEqual([salao]);
    expect(namesOf(biaEvents!, 'scene:closed')).toEqual([]);
    expect(sceneUpdatesOf(caioEvents!)).toEqual([]);
  });

  it('the private Salão Bia had open as a tab is closed for her with reason private', async () => {
    const salao = await groupGridOf();
    const estrada = await newGrid(live, live.ana, live.vharn, 'Estrada de Vharn');
    const [ana, bia] = await threeAtVharn();
    const biaEvents = recordEventsOf(bia);
    await gridAck(bia, 'scene:watch', live.vharn, salao);

    await activateGrid(ana, live.vharn, estrada);
    await send(ana, 'scene:configure', configureOf(salao));

    const closed = sceneClosedDto.parse(await eventPayload(biaEvents, 'scene:closed'));
    expect(closed).toMatchObject({ sceneId: salao, reason: 'private' });
    await silence();
    expect(sceneUpdatesOf(biaEvents)).toEqual([]);
  });

  it("after the move, Caio's sheet and a defined condition still reach Bia, as events of the cast", async () => {
    const estrada = await newGrid(live, live.ana, live.vharn, 'Estrada de Vharn');
    const castId = await castIdOf(live, live.bia, live.vharn);
    const [ana, bia, caio] = await threeAtVharn();
    const biaEvents = recordEventsOf(bia);

    await activateGrid(ana, live.vharn, estrada);
    const card = {
      ...envelope(live.vharn.id),
      memberId: live.caio.id,
      changes: { armorClass: 15 },
    };
    expect(await send(caio, 'member:updateCard', card)).toMatchObject({ ok: true });
    const condition = {
      ...envelope(live.vharn.id),
      name: 'Sangrando',
      tone: 'harm',
      icon: 'droplet',
    };
    expect(await send(ana, 'condition:define', condition)).toMatchObject({ ok: true });

    expect(await eventPayload(biaEvents, 'member:cardChanged')).toMatchObject({ sceneId: castId });
    expect(await eventPayload(biaEvents, 'condition:defined')).toMatchObject({ sceneId: castId });
  });

  it('Bia taking the group anywhere is FORBIDDEN and nobody is moved', async () => {
    const salao = await groupGridOf();
    const estrada = await newGrid(live, live.ana, live.vharn, 'Estrada de Vharn');
    await setGridVisibility(live, live.ana, live.vharn, estrada, 'public');
    const [, bia] = await threeAtVharn();
    const biaEvents = recordEventsOf(bia);

    const refused = await activateGrid(bia, live.vharn, estrada);

    expect(refused).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(await groupGridOf()).toBe(salao);
    await silence();
    expect(namesOf(biaEvents, 'scene:activated')).toEqual([]);
  });

  it('a grid of Quelm is SCENE_NOT_FOUND and the group grid of Vharn stays', async () => {
    const salao = await groupGridOf();
    const quelmGrid = await newGrid(live, live.caio, live.quelm, 'Torre da Quelm');
    const ana = await live.atTable(live.ana, live.vharn);

    const refused = await activateGrid(ana, live.vharn, quelmGrid);

    expect(refused).toEqual({
      ok: false,
      error: { code: 'SCENE_NOT_FOUND', message: 'Scene not found' },
    });
    expect(await groupGridOf()).toBe(salao);
  });

  it('a scene:activate with a forged userId is INVALID_BODY', async () => {
    const estrada = await newGrid(live, live.ana, live.vharn, 'Estrada de Vharn');
    const ana = await live.atTable(live.ana, live.vharn);
    const timed = ana.timeout(2000);
    const emit = timed.emitWithAck as Emit;

    const forged = { ...envelope(live.vharn.id), sceneId: estrada, userId: live.bia.id };

    expect(await emit.call(timed, 'scene:activate', forged)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_BODY' },
    });
  });

  it('after a restart the Estrada is still the group grid, and a new join hears it', async () => {
    const estrada = await newGrid(live, live.ana, live.vharn, 'Estrada de Vharn');
    await activateGrid(await live.atTable(live.ana, live.vharn), live.vharn, estrada);

    await live.restart();
    const [ana, bia] = await threeAtVharn();
    const biaEvents = recordEventsOf(bia);
    await send(ana, 'scene:configure', configureOf(estrada));

    expect(await groupGridOf()).toBe(estrada);
    await eventPayload(biaEvents, 'scene:updated');
    expect(sceneUpdatesOf(biaEvents)).toEqual([estrada]);
  });
});

describe('closing a grid tab when the grid becomes private or is deleted', () => {
  it('Ana hiding the Torre Bia opened: Bia gets scene:closed private and nothing more of it', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    await setGridVisibility(live, live.ana, live.vharn, torre, 'public');
    const [ana, bia] = await threeAtVharn();
    const [anaEvents, biaEvents] = [ana, bia].map(recordEventsOf);
    await gridAck(ana, 'scene:watch', live.vharn, torre);
    await gridAck(bia, 'scene:watch', live.vharn, torre);

    await setGridVisibility(live, live.ana, live.vharn, torre, 'private');
    await send(ana, 'scene:configure', configureOf(torre));

    const closed = sceneClosedDto.parse(await eventPayload(biaEvents!, 'scene:closed'));
    expect(closed).toMatchObject({ campaignId: live.vharn.id, sceneId: torre, reason: 'private' });
    await eventPayload(anaEvents!, 'scene:updated');
    await silence();
    expect(sceneUpdatesOf(biaEvents!)).toEqual([]);
    expect(namesOf(anaEvents!, 'scene:closed')).toEqual([]);
  });

  it('a closed tab is forgotten: unwatching it after is still ok and watching again is SCENE_NOT_FOUND', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    await setGridVisibility(live, live.ana, live.vharn, torre, 'public');
    const [, bia] = await threeAtVharn();
    await gridAck(bia, 'scene:watch', live.vharn, torre);

    await setGridVisibility(live, live.ana, live.vharn, torre, 'private');

    expect(await gridAck(bia, 'scene:watch', live.vharn, torre)).toMatchObject({
      ok: false,
      error: { code: 'SCENE_NOT_FOUND' },
    });
  });

  it('hiding the group grid closes nothing: the group stays on it', async () => {
    const salao = await groupGridOf();
    await setGridVisibility(live, live.ana, live.vharn, salao, 'public');
    const [ana, bia] = await threeAtVharn();
    const biaEvents = recordEventsOf(bia);

    await setGridVisibility(live, live.ana, live.vharn, salao, 'private');
    await send(ana, 'scene:configure', configureOf(salao));

    await eventPayload(biaEvents, 'scene:updated');
    expect(namesOf(biaEvents, 'scene:closed')).toEqual([]);
  });

  it('deleting the Torre Ana opened: Ana gets scene:closed deleted', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    const [ana, bia] = await threeAtVharn();
    const [anaEvents, biaEvents] = [ana, bia].map(recordEventsOf);
    await gridAck(ana, 'scene:watch', live.vharn, torre);

    const url = `/api/campaigns/${live.vharn.id}/scenes/${torre}`;
    expect((await live.http(live.ana, { method: 'DELETE', url })).statusCode).toBe(204);

    const closed = sceneClosedDto.parse(await eventPayload(anaEvents!, 'scene:closed'));
    expect(closed).toMatchObject({ sceneId: torre, reason: 'deleted' });
    await silence();
    expect(namesOf(biaEvents!, 'scene:closed')).toEqual([]);
  });
});
