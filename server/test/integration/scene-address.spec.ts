import { sceneUpdatedDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { gridAck, newGrid, setGridVisibility } from '../support/grids';
import { envelope, eventPayload, send, synced } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
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

function configureOf(sceneId?: string): object {
  return { ...envelope(live.vharn.id), ...GRID_30_BY_20, ...(sceneId ? { sceneId } : {}) };
}

describe('a command and a snapshot addressed to a grid that is not the group one', () => {
  it('Ana configures the private Torre: the ack has its version 1 and the group grid keeps its own', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    const ana = await live.atTable(live.ana, live.vharn);
    const before = await synced(ana, live.vharn);

    expect(await send(ana, 'scene:configure', configureOf(torre))).toEqual({
      ok: true,
      version: 1,
    });

    const group = await synced(ana, live.vharn);
    expect(group.scene.id).toBe(before.scene.id);
    expect(group.version).toBe(before.version);
    expect(group.scene.widthCells).toBe(20);
  });

  it("Ana's board:sync of the Torre brings the Torre with what was configured", async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    const ana = await live.atTable(live.ana, live.vharn);
    await send(ana, 'scene:configure', configureOf(torre));

    const ack = await gridAck(ana, 'board:sync', live.vharn, torre);

    expect(ack).toMatchObject({
      ok: true,
      state: { version: 1, scene: { id: torre, name: 'Torre', widthCells: 30 } },
    });
  });

  it("Bia's board:sync of the private Torre is SCENE_NOT_FOUND, never FORBIDDEN", async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    const bia = await live.atTable(live.bia, live.vharn);

    expect(await gridAck(bia, 'board:sync', live.vharn, torre)).toEqual({
      ok: false,
      error: { code: 'SCENE_NOT_FOUND', message: 'Scene not found' },
    });
  });

  it('once the Torre is public, Bia gets its snapshot redacted for her', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    await setGridVisibility(live, live.ana, live.vharn, torre, 'public');
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await gridAck(bia, 'board:sync', live.vharn, torre);

    expect(ack).toMatchObject({
      ok: true,
      state: { scene: { id: torre }, viewer: { userId: live.bia.id, role: 'player' } },
    });
  });

  it('Bia configuring the private Torre is SCENE_NOT_FOUND and the Torre stays at version 0', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    const bia = await live.atTable(live.bia, live.vharn);
    const ana = await live.atTable(live.ana, live.vharn);

    const answer = await send(bia, 'scene:configure', configureOf(torre));

    expect(answer).toEqual({
      ok: false,
      error: { code: 'SCENE_NOT_FOUND', message: 'Scene not found' },
    });
    expect(await gridAck(ana, 'board:sync', live.vharn, torre)).toMatchObject({
      state: { version: 0, scene: { widthCells: 20 } },
    });
  });

  it('a grid of Quelm sent at Vharn is SCENE_NOT_FOUND for the sync and for the configure', async () => {
    const quelmGrid = await newGrid(live, live.caio, live.quelm, 'Cripta da Quelm');
    await setGridVisibility(live, live.caio, live.quelm, quelmGrid, 'public');
    const ana = await live.atTable(live.ana, live.vharn);

    const sync = await gridAck(ana, 'board:sync', live.vharn, quelmGrid);
    const configure = await send(ana, 'scene:configure', configureOf(quelmGrid));

    expect(sync).toMatchObject({ ok: false, error: { code: 'SCENE_NOT_FOUND' } });
    expect(configure).toMatchObject({ ok: false, error: { code: 'SCENE_NOT_FOUND' } });
  });

  it('without sceneId the configure and the sync act on the group grid, as before', async () => {
    await newGrid(live, live.ana, live.vharn, 'Torre');
    const ana = await live.atTable(live.ana, live.vharn);
    const library = await live.http(live.ana, {
      method: 'GET',
      url: `/api/campaigns/${live.vharn.id}/scenes`,
    });
    const groupId: unknown = library.json().activeSceneId;

    expect(await send(ana, 'scene:configure', configureOf())).toEqual({ ok: true, version: 1 });
    expect(await synced(ana, live.vharn)).toMatchObject({
      version: 1,
      scene: { id: groupId, widthCells: 30 },
    });
  });

  it('the scene:updated of the Torre names it as its sceneId', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    const ana = await live.atTable(live.ana, live.vharn);
    const anaEvents = recordEventsOf(ana);
    await gridAck(ana, 'scene:watch', live.vharn, torre);

    await send(ana, 'scene:configure', configureOf(torre));

    const event = sceneUpdatedDto.parse(await eventPayload(anaEvents, 'scene:updated'));
    expect(event).toMatchObject({ sceneId: torre, version: 1, scene: { id: torre } });
  });
});
