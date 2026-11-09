import {
  librarySceneDto,
  tokenMovedDto,
  tokensDraggedDto,
  type TokenDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { gridAck, newGrid } from '../support/grids';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import type { Table } from '../support/tables';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const FINE_COL = 3.015625;
const FINE_ROW = 2.5;
const GRID = {
  widthCells: 20,
  heightCells: 12,
  cellDistance: 1.5,
  cellUnit: 'm',
  gridVisible: true,
  gridOpacity: 30,
};
const WALL_AT_COLUMN_5 = {
  kind: 'wall',
  shape: 'line',
  x: 5,
  y: 0,
  width: 0,
  height: 12,
  points: [
    [0, 0],
    [0, 12],
  ],
} as const;

function configureOn(table: Table, freeMovement?: boolean, sceneId?: string): object {
  return {
    ...envelope(table.id),
    ...GRID,
    ...(freeMovement === undefined ? {} : { freeMovement }),
    ...(sceneId ? { sceneId } : {}),
  };
}

describe('free movement over Socket.IO', () => {
  const live = useTokenTable();

  // The free Vharn with Lyra of Bia at (3, 4), and Ana and Bia at the table.
  async function freeTableWithLyra(): Promise<{
    ana: RealtimeClient;
    bia: RealtimeClient;
    lyra: TokenDto;
  }> {
    const ana = await live.atTable(live.ana, live.vharn);
    const bia = await live.atTable(live.bia, live.vharn);
    await send(ana, 'scene:configure', configureOn(live.vharn, true));
    const anaEvents = recordEventsOf(ana);
    await send(ana, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
    return { ana, bia, lyra: await createdTokenOf(anaEvents) };
  }

  function moveOf(tokenId: string, col: number, row: number): object {
    return { ...envelope(live.vharn.id), tokenId, col, row };
  }

  it('a scene that was just created comes with freeMovement false', async () => {
    const ana = await live.atTable(live.ana, live.vharn);

    expect((await synced(ana, live.vharn)).scene.freeMovement).toBe(false);
  });

  it('Ana turning the mode on reaches Bia in scene:updated and a configure without it keeps it', async () => {
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const ana = await live.atTable(live.ana, live.vharn);

    expect(await send(ana, 'scene:configure', configureOn(live.vharn, true))).toEqual({
      ok: true,
      version: 1,
    });
    expect(await eventPayload(bia, 'scene:updated')).toMatchObject({
      version: 1,
      scene: { freeMovement: true },
    });
    await send(ana, 'scene:configure', configureOn(live.vharn));
    expect((await synced(ana, live.vharn)).scene.freeMovement).toBe(true);
  });

  it('Bia cannot turn the mode on: FORBIDDEN and the grid stays', async () => {
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'scene:configure', configureOn(live.vharn, true));

    expect(ack).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect((await synced(bia, live.vharn)).scene.freeMovement).toBe(false);
  });

  it('token:move to a fine position persists and comes out equal in token:moved and in the sync after a restart', async () => {
    const { ana, bia, lyra } = await freeTableWithLyra();
    const anaEvents = recordEventsOf(ana);

    expect(await send(bia, 'token:move', moveOf(lyra.id, FINE_COL, FINE_ROW))).toMatchObject({
      ok: true,
    });

    const moved = tokenMovedDto.parse(await eventPayload(anaEvents, 'token:moved'));
    expect(moved).toMatchObject({ tokenId: lyra.id, col: FINE_COL, row: FINE_ROW });
    await live.restart();
    const again = await live.atTable(live.ana, live.vharn);
    const state = await synced(again, live.vharn);
    expect(state.tokens[0]).toMatchObject({ col: FINE_COL, row: FINE_ROW });
    expect(state.scene.freeMovement).toBe(true);
  });

  it('a fine token:dragMany reaches the others and adds no version', async () => {
    const { ana, bia, lyra } = await freeTableWithLyra();
    const anaEvents = recordEventsOf(ana);
    const before = (await synced(ana, live.vharn)).version;
    const drags = [{ tokenId: lyra.id, cell: { col: FINE_COL, row: FINE_ROW } }];

    const ack = await send(bia, 'token:dragMany', { ...envelope(live.vharn.id), drags });

    expect(ack).toEqual({ ok: true, version: before });
    const dragged = tokensDraggedDto.parse(await eventPayload(anaEvents, 'token:draggedMany'));
    expect(dragged.drags).toEqual(drags);
    const state = await synced(ana, live.vharn);
    expect(state.version).toBe(before);
    expect(state.tokens[0]).toMatchObject({ col: 3, row: 4 });
  });

  it('turning the mode off leaves the token where it is', async () => {
    const { ana, lyra } = await freeTableWithLyra();
    await send(ana, 'token:move', moveOf(lyra.id, FINE_COL, FINE_ROW));

    await send(ana, 'scene:configure', configureOn(live.vharn, false));

    const state = await synced(ana, live.vharn);
    expect(state.scene.freeMovement).toBe(false);
    expect(state.tokens[0]).toMatchObject({ col: FINE_COL, row: FINE_ROW });
  });

  it('with the mode off, a group move and the undo expect of a fine position are still accepted', async () => {
    const { ana, lyra } = await freeTableWithLyra();
    await send(ana, 'token:move', moveOf(lyra.id, FINE_COL, FINE_ROW));
    await send(ana, 'scene:configure', configureOn(live.vharn, false));
    const expected = { col: FINE_COL, row: FINE_ROW };
    const moves = [{ tokenId: lyra.id, col: 6, row: 6, expect: expected }];

    const ack = await send(ana, 'token:moveMany', { ...envelope(live.vharn.id), moves });

    expect(ack).toMatchObject({ ok: true });
    expect((await synced(ana, live.vharn)).tokens[0]).toMatchObject({ col: 6, row: 6 });
  });

  it('a fine position on a grid that snaps is accepted too: the mode only changes the gesture', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const anaEvents = recordEventsOf(ana);
    await send(ana, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
    const lyra = await createdTokenOf(anaEvents);

    expect(await send(ana, 'token:move', moveOf(lyra.id, FINE_COL, FINE_ROW))).toMatchObject({
      ok: true,
    });
  });

  it('3.01 is not a step of 1/64: INVALID_BODY and the token stays', async () => {
    const { ana, lyra } = await freeTableWithLyra();

    const ack = await send(ana, 'token:move', moveOf(lyra.id, 3.01, FINE_ROW));

    expect(ack).toMatchObject({ ok: false, error: { code: 'INVALID_BODY' } });
    expect((await synced(ana, live.vharn)).tokens[0]).toMatchObject({ col: 3, row: 4 });
  });

  it("Bia's token crossing a wall is WALL_BLOCKED, and the master goes through", async () => {
    const { ana, bia, lyra } = await freeTableWithLyra();
    await send(ana, 'wall:createMany', { ...envelope(live.vharn.id), walls: [WALL_AT_COLUMN_5] });

    const refused = await send(bia, 'token:move', moveOf(lyra.id, 6.015625, FINE_ROW));

    expect(refused).toMatchObject({ ok: false, error: { code: 'WALL_BLOCKED' } });
    expect((await synced(bia, live.vharn)).tokens[0]).toMatchObject({ col: 3, row: 4 });
    const master = await send(ana, 'token:move', moveOf(lyra.id, 6.015625, FINE_ROW));
    expect(master).toMatchObject({ ok: true });
  });

  it('a fine position that does not fit the scene is OUT_OF_SCENE', async () => {
    const { ana, lyra } = await freeTableWithLyra();

    const ack = await send(ana, 'token:move', moveOf(lyra.id, 19.015625, FINE_ROW));

    expect(ack).toMatchObject({ ok: false, error: { code: 'OUT_OF_SCENE' } });
  });

  it('a grid of Quelm configured from Vharn is SCENE_NOT_FOUND', async () => {
    const quelmGrid = await newGrid(live, live.caio, live.quelm, 'Torre da Quelm');
    const ana = await live.atTable(live.ana, live.vharn);

    const ack = await send(ana, 'scene:configure', configureOn(live.vharn, true, quelmGrid));

    expect(ack).toMatchObject({ ok: false, error: { code: 'SCENE_NOT_FOUND' } });
  });

  it('the scene:updated of Vharn does not reach whoever is only at Quelm', async () => {
    const caio = recordEventsOf(await live.atTable(live.caio, live.quelm));
    const ana = await live.atTable(live.ana, live.vharn);

    await send(ana, 'scene:configure', configureOn(live.vharn, true));

    await silence();
    expect(caio.events.map(({ name }) => name)).not.toContain('scene:updated');
  });

  it('turning the mode on in the Torre leaves the group grid snapping', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    const ana = await live.atTable(live.ana, live.vharn);

    await send(ana, 'scene:configure', configureOn(live.vharn, true, torre));

    expect((await synced(ana, live.vharn)).scene.freeMovement).toBe(false);
    expect(await gridAck(ana, 'board:sync', live.vharn, torre)).toMatchObject({
      state: { scene: { freeMovement: true } },
    });
  });

  it('Duplicar copies the mode and the fine position of the token', async () => {
    const { ana, lyra } = await freeTableWithLyra();
    await send(ana, 'token:move', moveOf(lyra.id, FINE_COL, FINE_ROW));
    const groupId = (await synced(ana, live.vharn)).scene.id;
    const url = `/api/campaigns/${live.vharn.id}/scenes/${groupId}/copies`;

    const response = await live.http(live.ana, { method: 'POST', url });

    const copy = librarySceneDto.parse(response.json());
    expect(await gridAck(ana, 'board:sync', live.vharn, copy.id)).toMatchObject({
      state: {
        scene: { freeMovement: true },
        tokens: [{ col: FINE_COL, row: FINE_ROW }],
      },
    });
  });
});
