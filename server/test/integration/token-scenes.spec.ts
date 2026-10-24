import { tokenCreatedDto, tokenMovedDto, tokensDraggedDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { gridAck, newGrid, setGridVisibility } from '../support/grids';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { recordEventsOf, type EventRecorder } from '../support/realtime-client';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();

type Emit = (event: string, payload: object) => Promise<unknown>;

function namesOf(recorder: EventRecorder): string[] {
  return recorder.events.map(({ name }) => name).filter((name) => name.startsWith('token:'));
}

// The Torre, public and open as a tab by Ana and Bia; Lyra of Bia stands on it.
async function publicTorreWithLyra() {
  const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
  await setGridVisibility(live, live.ana, live.vharn, torre, 'public');
  const ana = await live.atTable(live.ana, live.vharn);
  const bia = await live.atTable(live.bia, live.vharn);
  const anaEvents = recordEventsOf(ana);
  await gridAck(ana, 'scene:watch', live.vharn, torre);
  await gridAck(bia, 'scene:watch', live.vharn, torre);
  await send(ana, 'token:create', { ...tokenCommandFor(live.vharn, live.bia.id), sceneId: torre });
  const lyra = await createdTokenOf(anaEvents);
  return { torre, ana, bia, anaEvents, lyra };
}

describe('tokens on a grid that is not the group one', () => {
  it('Ana creates a goblin in the Torre she opened and only she hears token:created', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    const ana = await live.atTable(live.ana, live.vharn);
    const [biaEvents, caioEvents] = [
      recordEventsOf(await live.atTable(live.bia, live.vharn)),
      recordEventsOf(await live.atTable(live.caio, live.vharn)),
    ];
    const anaEvents = recordEventsOf(ana);
    await gridAck(ana, 'scene:watch', live.vharn, torre);

    const goblin = { ...tokenCommandFor(live.vharn, live.bia.id), name: 'Goblin', sceneId: torre };
    expect(await send(ana, 'token:create', goblin)).toEqual({ ok: true, version: 1 });

    const created = tokenCreatedDto.parse(await eventPayload(anaEvents, 'token:created'));
    expect(created).toMatchObject({ sceneId: torre, version: 1, token: { name: 'Goblin' } });
    await silence();
    expect([namesOf(biaEvents!), namesOf(caioEvents!)]).toEqual([[], []]);
  });

  it('Bia moves her Lyra in the public Torre: Ana hears token:moved of the Torre and the group grid keeps its version', async () => {
    const { torre, ana, bia, anaEvents, lyra } = await publicTorreWithLyra();
    const groupBefore = (await synced(ana, live.vharn)).version;

    const move = { ...envelope(live.vharn.id), sceneId: torre, tokenId: lyra.id, col: 6, row: 6 };
    expect(await send(bia, 'token:move', move)).toEqual({ ok: true, version: 2 });

    const moved = tokenMovedDto.parse(await eventPayload(anaEvents, 'token:moved'));
    expect(moved).toMatchObject({ sceneId: torre, version: 2, tokenId: lyra.id, col: 6, row: 6 });
    expect((await synced(ana, live.vharn)).version).toBe(groupBefore);
  });

  it('in the Torre the PV seen by controllers of Bram does not reach Bia', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    await setGridVisibility(live, live.ana, live.vharn, torre, 'public');
    const ana = await live.atTable(live.ana, live.vharn);
    const bia = await live.atTable(live.bia, live.vharn);
    const caio = await live.atTable(live.caio, live.vharn);
    for (const client of [ana, bia, caio]) await gridAck(client, 'scene:watch', live.vharn, torre);
    const [biaEvents, caioEvents] = [bia, caio].map(recordEventsOf);

    const bram = { ...tokenCommandFor(live.vharn, live.caio.id), name: 'Bram', sceneId: torre };
    await send(ana, 'token:create', bram);

    const toCaio = tokenCreatedDto.parse(await eventPayload(caioEvents!, 'token:created'));
    const toBia = tokenCreatedDto.parse(await eventPayload(biaEvents!, 'token:created'));
    expect(toCaio.token.bars.map(({ label }) => label)).toEqual(['PV', 'Inspiração']);
    expect(toBia.token.bars.map(({ label }) => label)).toEqual(['Inspiração']);
    expect(toBia.sceneId).toBe(torre);
  });

  it('token:dragMany in the Torre answers its version without saving and reaches Ana with the Torre', async () => {
    const { torre, bia, anaEvents, lyra } = await publicTorreWithLyra();

    const drags = [{ tokenId: lyra.id, cell: { col: 7, row: 7 } }];
    const drag = { ...envelope(live.vharn.id), sceneId: torre, drags };
    expect(await send(bia, 'token:dragMany', drag)).toEqual({ ok: true, version: 1 });

    const dragged = tokensDraggedDto.parse(await eventPayload(anaEvents, 'token:draggedMany'));
    expect(dragged).toMatchObject({ sceneId: torre, drags });
  });

  it('a token of the group grid addressed to the Torre is TOKEN_NOT_FOUND', async () => {
    const { torre, ana } = await publicTorreWithLyra();
    await send(ana, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
    const [groupLyra] = (await synced(ana, live.vharn)).tokens;

    const move = {
      ...envelope(live.vharn.id),
      sceneId: torre,
      tokenId: groupLyra?.id,
      col: 1,
      row: 1,
    };
    const ack = await send(ana, 'token:move', move);

    expect(ack).toMatchObject({ ok: false, error: { code: 'TOKEN_NOT_FOUND' } });
  });

  it("a sceneId of Quelm's grid at Vharn is SCENE_NOT_FOUND", async () => {
    const quelmTorre = await newGrid(live, live.caio, live.quelm, 'Torre da Quelm');
    const ana = await live.atTable(live.ana, live.vharn);

    const create = { ...tokenCommandFor(live.vharn, live.bia.id), sceneId: quelmTorre };
    const ack = await send(ana, 'token:create', create);

    expect(ack).toEqual({
      ok: false,
      error: { code: 'SCENE_NOT_FOUND', message: 'Scene not found' },
    });
  });

  it('Bia moving in the private Torre is SCENE_NOT_FOUND, never FORBIDDEN', async () => {
    const { torre, bia, lyra } = await publicTorreWithLyra();
    await setGridVisibility(live, live.ana, live.vharn, torre, 'private');

    const move = { ...envelope(live.vharn.id), sceneId: torre, tokenId: lyra.id, col: 2, row: 2 };
    const ack = await send(bia, 'token:move', move);

    expect(ack).toMatchObject({ ok: false, error: { code: 'SCENE_NOT_FOUND' } });
  });

  it('a token command with a forged userId is INVALID_BODY', async () => {
    const { torre, bia, lyra } = await publicTorreWithLyra();
    const timed = bia.timeout(2000);
    const emit = timed.emitWithAck as Emit;

    const forged = {
      ...envelope(live.vharn.id),
      sceneId: torre,
      tokenId: lyra.id,
      col: 2,
      row: 2,
      userId: live.ana.id,
    };
    const ack = await emit.call(timed, 'token:move', forged);

    expect(ack).toMatchObject({ ok: false, error: { code: 'INVALID_BODY' } });
  });
});
