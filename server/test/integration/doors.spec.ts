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

describe('doors lit by a torch over Socket.IO', () => {
  const live = useTokenTable();
  // One cell past the door (x = 5, y from 3 to 6), in front of the blind Lyra at (3, 4).
  const TORCH = { x: 6, y: 4.5, bright: 2, dim: 0 };

  async function darkVharnWithBlindLyra(): Promise<{ doorId: string; ana: EventRecorder }> {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    await send(ana.client, 'scene:configure', {
      ...envelope(live.vharn.id),
      ...GRID,
      vision: 'dark',
    });
    await send(ana.client, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
    const ack = await send(ana.client, 'wall:createMany', {
      ...envelope(live.vharn.id),
      walls: [DOOR],
    });
    const [doorId] = (ack as { createdIds: string[] }).createdIds;
    if (!doorId) throw new Error('the door was not created');
    return { doorId, ana };
  }

  async function torchOn(table: Table, recorder: EventRecorder): Promise<string> {
    const ack = await send(recorder.client, 'light:createMany', {
      ...envelope(table.id),
      lights: [TORCH],
    });
    const [lightId] = (ack as { createdIds: string[] }).createdIds;
    if (!lightId) throw new Error('the torch was not created');
    return lightId;
  }

  function setDoorOn(table: Table, wallId: string, state: string): object {
    return { ...envelope(table.id), wallId, state };
  }

  it('Bia opens the door the torch lights, though Lyra has no darkvision', async () => {
    const { doorId, ana } = await darkVharnWithBlindLyra();
    await torchOn(live.vharn, ana);
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'wall:setDoor', setDoorOn(live.vharn, doorId, 'open'));

    expect(ack).toMatchObject({ ok: true });
  });

  it('once Ana puts out the torch, Bia closing the door is FORBIDDEN', async () => {
    const { doorId, ana } = await darkVharnWithBlindLyra();
    const torchId = await torchOn(live.vharn, ana);
    const bia = await live.atTable(live.bia, live.vharn);
    await send(bia, 'wall:setDoor', setDoorOn(live.vharn, doorId, 'open'));
    await send(ana.client, 'light:setLitMany', {
      ...envelope(live.vharn.id),
      lightIds: [torchId],
      lit: false,
    });

    const ack = await send(bia, 'wall:setDoor', setDoorOn(live.vharn, doorId, 'closed'));

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
  });

  it('a torch of Quelm at the same point does not light the door of Vharn', async () => {
    const { doorId } = await darkVharnWithBlindLyra();
    await torchOn(live.quelm, recordEventsOf(await live.atTable(live.caio, live.quelm)));
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'wall:setDoor', setDoorOn(live.vharn, doorId, 'open'));

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
  });
});

describe('doors and the cone of sight over Socket.IO', () => {
  const live = useTokenTable();
  // Lyra stands at (5, 5), center (5.5, 5.5), looking right; a door runs down x = 3, behind her.
  const BEHIND = { ...DOOR, x: 3, y: 4 };
  const AT_HER_BACK = { ...DOOR, x: 4, y: 4 };

  async function darkVharnWith(door: object, lyra: object): Promise<string> {
    const ana = await live.atTable(live.ana, live.vharn);
    await send(ana, 'scene:configure', { ...envelope(live.vharn.id), ...GRID, vision: 'dark' });
    const place = { col: 5, row: 5, ...lyra };
    await send(ana, 'token:create', tokenCommandFor(live.vharn, live.bia.id, place));
    const ack = await send(ana, 'wall:createMany', { ...envelope(live.vharn.id), walls: [door] });
    const [doorId] = (ack as { createdIds: string[] }).createdIds;
    if (!doorId) throw new Error('the door was not created');
    return doorId;
  }

  function openOn(wallId: string): object {
    return { ...envelope(live.vharn.id), wallId, state: 'open' };
  }

  const NARROW_LYRA = { sight: { bright: 6, dim: 0 }, sightAngle: 90 };

  it('Bia opening the door behind Lyra (90°, looking right) is FORBIDDEN', async () => {
    const doorId = await darkVharnWith(BEHIND, NARROW_LYRA);
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'wall:setDoor', openOn(doorId));

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    await silence();
    expect(ana.events.map(({ name }) => name)).not.toContain('wall:doorChanged');
  });

  it('once Bia turns Lyra around, opening the door reaches Ana and Caio', async () => {
    const doorId = await darkVharnWith(BEHIND, NARROW_LYRA);
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const bia = await live.atTable(live.bia, live.vharn);
    const [lyra] = (await synced(bia, live.vharn)).tokens;
    const faces = [{ tokenId: lyra?.id, facing: 180 }];
    await send(bia, 'token:faceMany', { ...envelope(live.vharn.id), faces });

    expect(await send(bia, 'wall:setDoor', openOn(doorId))).toMatchObject({ ok: true });
    for (const recorder of [ana, caio]) {
      expect(await eventPayload(recorder, 'wall:doorChanged')).toMatchObject({ wallId: doorId });
    }
  });

  it('a door right at the back of Lyra is felt by the ring and opens', async () => {
    const doorId = await darkVharnWith(AT_HER_BACK, NARROW_LYRA);
    const bia = await live.atTable(live.bia, live.vharn);

    expect(await send(bia, 'wall:setDoor', openOn(doorId))).toMatchObject({ ok: true });
  });

  it('the lantern of Bram aimed away leaves the door dark for the blind Lyra; aimed at it, it opens', async () => {
    const doorId = await darkVharnWith(BEHIND, {});
    const lantern = { light: { bright: 6, dim: 0, angle: 60 }, name: 'Bram', col: 6, row: 5 };
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    await send(ana.client, 'token:create', tokenCommandFor(live.vharn, live.caio.id, lantern));
    const bramId = (await synced(ana.client, live.vharn)).tokens.find(
      ({ name }) => name === 'Bram',
    )?.id;
    const bia = await live.atTable(live.bia, live.vharn);
    const caio = await live.atTable(live.caio, live.vharn);

    const away = await send(bia, 'wall:setDoor', openOn(doorId));
    const faces = [{ tokenId: bramId, facing: 180 }];
    await send(caio, 'token:faceMany', { ...envelope(live.vharn.id), faces });
    const aimed = await send(bia, 'wall:setDoor', {
      ...openOn(doorId),
      actionId: crypto.randomUUID(),
    });

    expect(away).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    expect(aimed).toMatchObject({ ok: true });
  });

  it('a spotlight of the map aimed away leaves the door dark for the blind Lyra; aimed at it, it opens', async () => {
    const doorId = await darkVharnWith(BEHIND, {});
    const ana = await live.atTable(live.ana, live.vharn);
    // At (6.5, 5.5), right of Lyra: facing 0 lights the far side, facing 180 the door at x = 3.
    const spotlight = { x: 6.5, y: 5.5, bright: 6, dim: 0, facing: 0, angle: 60 };
    const created = await send(ana, 'light:createMany', {
      ...envelope(live.vharn.id),
      lights: [spotlight],
    });
    const [lightId] = (created as { createdIds: string[] }).createdIds;
    const bia = await live.atTable(live.bia, live.vharn);

    const away = await send(bia, 'wall:setDoor', openOn(doorId));
    const changes = [{ lightId, facing: 180, angle: 60 }];
    await send(ana, 'light:setConeMany', { ...envelope(live.vharn.id), changes });
    const aimed = await send(bia, 'wall:setDoor', {
      ...openOn(doorId),
      actionId: crypto.randomUUID(),
    });

    expect(away).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    expect(aimed).toMatchObject({ ok: true });
  });
});
