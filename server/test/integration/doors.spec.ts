import { describe, expect, it } from 'vitest';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { WallsDao } from '../../src/modules/walls/walls.dao';
import { recordEventsOf, type EventRecorder } from '../support/realtime-client';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import type { Table } from '../support/tables';
import { tokenCommandFor, useTokenTable } from '../support/token-table';

const GRID = {
  widthCells: 20,
  heightCells: 12,
  cellDistance: 1.5,
  cellUnit: 'm',
  gridVisible: true,
  gridOpacity: 30,
};
// Lyra stands at (3, 4), center (3.5, 4.5), and sees 4 cells; the door runs down x = 5.
const DOOR = {
  kind: 'door',
  shape: 'line',
  x: 5,
  y: 3,
  width: 0,
  height: 3,
  points: [
    [0, 0],
    [0, 3],
  ],
} as const;

describe('doors over Socket.IO', () => {
  const live = useTokenTable();

  async function darkVharnWithDoor(): Promise<{ doorId: string; ana: EventRecorder }> {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    await send(ana.client, 'scene:configure', {
      ...envelope(live.vharn.id),
      ...GRID,
      vision: 'dark',
    });
    const sight = { bright: 4, dim: 0 };
    await send(ana.client, 'token:create', tokenCommandFor(live.vharn, live.bia.id, { sight }));
    const ack = await send(ana.client, 'wall:createMany', {
      ...envelope(live.vharn.id),
      walls: [DOOR],
    });
    const [doorId] = (ack as { createdIds: string[] }).createdIds;
    if (!doorId) throw new Error('the door was not created');
    return { doorId, ana };
  }

  function setDoorOn(table: Table, wallId: string, state: string): object {
    return { ...envelope(table.id), wallId, state };
  }

  it('Bia opening the door beside Lyra reaches Ana and Caio in wall:doorChanged', async () => {
    const { doorId, ana } = await darkVharnWithDoor();
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'wall:setDoor', setDoorOn(live.vharn, doorId, 'open'));

    expect(ack).toMatchObject({ ok: true });
    for (const recorder of [ana, caio]) {
      expect(await eventPayload(recorder, 'wall:doorChanged')).toMatchObject({
        wallId: doorId,
        doorState: 'open',
      });
    }
  });

  it('Caio, with no token near, is FORBIDDEN and no one hears an event', async () => {
    const { doorId, ana } = await darkVharnWithDoor();
    const caio = await live.atTable(live.caio, live.vharn);

    const ack = await send(caio, 'wall:setDoor', setDoorOn(live.vharn, doorId, 'open'));

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    await silence();
    expect(ana.events.map(({ name }) => name)).not.toContain('wall:doorChanged');
  });

  it('Ana locking the door makes Bia hear DOOR_LOCKED', async () => {
    const { doorId, ana } = await darkVharnWithDoor();
    await send(ana.client, 'wall:setDoor', setDoorOn(live.vharn, doorId, 'locked'));
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'wall:setDoor', setDoorOn(live.vharn, doorId, 'open'));

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'DOOR_LOCKED' }) });
  });

  it('with the door open, Lyra walks through it', async () => {
    const { doorId } = await darkVharnWithDoor();
    const bia = await live.atTable(live.bia, live.vharn);
    const [lyra] = (await synced(bia, live.vharn)).tokens;
    if (!lyra) throw new Error('Lyra was not created');
    const across = { ...envelope(live.vharn.id), tokenId: lyra.id, col: 7, row: 4 };

    const shut = await send(bia, 'token:move', across);
    await send(bia, 'wall:setDoor', setDoorOn(live.vharn, doorId, 'open'));
    const opened = await send(bia, 'token:move', { ...across, actionId: crypto.randomUUID() });

    expect(shut).toEqual({ ok: false, error: expect.objectContaining({ code: 'WALL_BLOCKED' }) });
    expect(opened).toMatchObject({ ok: true });
  });

  it('a door of Quelm in a command of Vharn is WALL_NOT_FOUND', async () => {
    const scene = await new ScenesDao(live.connection.db).findActiveOf(live.quelm.id);
    const [quelmDoor] = await new WallsDao(live.connection.db).insertMany([
      {
        sceneId: scene!.id,
        kind: 'door',
        shape: 'line',
        x: '1.00',
        y: '1.00',
        width: '0.00',
        height: '1.00',
        points: [
          [0, 0],
          [0, 1],
        ],
        doorState: 'closed',
      },
    ]);
    const ana = await live.atTable(live.ana, live.vharn);

    const ack = await send(ana, 'wall:setDoor', setDoorOn(live.vharn, quelmDoor!.id, 'open'));

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'WALL_NOT_FOUND' }) });
  });

  it('a forged userId is refused with INVALID_BODY', async () => {
    const { doorId } = await darkVharnWithDoor();
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'wall:setDoor', {
      ...setDoorOn(live.vharn, doorId, 'open'),
      userId: live.ana.id,
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
  });

  it('the door state survives a restart of the server', async () => {
    const { doorId, ana } = await darkVharnWithDoor();
    await send(ana.client, 'wall:setDoor', setDoorOn(live.vharn, doorId, 'locked'));

    await live.restart();

    const again = await live.atTable(live.bia, live.vharn);
    expect((await synced(again, live.vharn)).walls).toMatchObject([
      { id: doorId, doorState: 'locked' },
    ]);
  });
});
