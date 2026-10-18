import { wallsCreatedDto, type WallDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  recordEventsOf,
  type EventRecorder,
  type RealtimeClient,
} from '../support/realtime-client';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { useTokenTable } from '../support/token-table';

const NORTH_LINE = {
  kind: 'wall',
  shape: 'line',
  x: 2,
  y: 2,
  width: 4,
  height: 0,
  points: [
    [0, 0],
    [4, 0],
  ],
} as const;
const GRATE_BOX = { kind: 'grate', shape: 'rectangle', x: 8, y: 3, width: 2, height: 2 } as const;

describe('walls over Socket.IO', () => {
  const live = useTokenTable();

  function createOn(campaignId: string, walls: object[] = [NORTH_LINE]): object {
    return { ...envelope(campaignId), walls };
  }

  async function createdOf(recorder: EventRecorder): Promise<WallDto[]> {
    const payload = await eventPayload(recorder, 'wall:createdMany');
    return wallsCreatedDto.parse(payload).walls;
  }

  async function createdBy(client: RealtimeClient, campaignId: string): Promise<WallDto> {
    const events = recordEventsOf(client);
    await send(client, 'wall:createMany', createOn(campaignId));
    const [created] = await createdOf(events);
    if (!created) throw new Error('wall:createdMany carried no wall');
    return created;
  }

  it('Ana creating two walls reaches Bia and Caio, and the ack names the ids in order', async () => {
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const ana = await live.atTable(live.ana, live.vharn);

    const ack = await send(
      ana,
      'wall:createMany',
      createOn(live.vharn.id, [NORTH_LINE, GRATE_BOX]),
    );

    const created = await createdOf(bia);
    expect(ack).toEqual({ ok: true, version: 1, createdIds: created.map(({ id }) => id) });
    expect(created).toEqual([
      { ...NORTH_LINE, id: expect.any(String), doorState: null },
      { ...GRATE_BOX, id: expect.any(String), doorState: null },
    ]);
    expect(await createdOf(caio)).toEqual(created);
  });

  it('the board:sync of Bia carries the walls', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const wall = await createdBy(ana, live.vharn.id);
    const bia = await live.atTable(live.bia, live.vharn);

    expect((await synced(bia, live.vharn)).walls).toEqual([wall]);
  });

  it('Bia creating a wall is FORBIDDEN and no one hears an event', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'wall:createMany', createOn(live.vharn.id));

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    await silence();
    expect(ana.events.map(({ name }) => name)).not.toContain('wall:createdMany');
  });

  it('Ana moving, turning into a grate and deleting reach the three, each in one version', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const wall = await createdBy(ana.client, live.vharn.id);
    const base = envelope(live.vharn.id);

    const moved = await send(ana.client, 'wall:moveMany', {
      ...base,
      moves: [{ wallId: wall.id, x: 3, y: 5 }],
    });
    const changed = await send(ana.client, 'wall:setKindMany', {
      ...envelope(live.vharn.id),
      wallIds: [wall.id],
      kind: 'grate',
    });
    const deleted = await send(ana.client, 'wall:deleteMany', {
      ...envelope(live.vharn.id),
      wallIds: [wall.id],
    });

    expect([moved, changed, deleted]).toEqual([
      { ok: true, version: 2 },
      { ok: true, version: 3 },
      { ok: true, version: 4 },
    ]);
    for (const recorder of [ana, bia, caio]) {
      expect(await eventPayload(recorder, 'wall:movedMany')).toMatchObject({
        version: 2,
        moves: [{ wallId: wall.id, x: 3, y: 5 }],
      });
      expect(await eventPayload(recorder, 'wall:kindsChanged')).toMatchObject({
        version: 3,
        changes: [{ wallId: wall.id, kind: 'grate', doorState: null }],
      });
      expect(await eventPayload(recorder, 'wall:deletedMany')).toMatchObject({
        version: 4,
        wallIds: [wall.id],
      });
    }
  });

  it('a wall of Quelm in a command of Vharn is WALL_NOT_FOUND, nothing is heard and Quelm keeps it', async () => {
    const caio = await live.atTable(live.caio, live.quelm);
    const quelmWall = await createdBy(caio, live.quelm.id);
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));

    const ack = await send(ana.client, 'wall:deleteMany', {
      ...envelope(live.vharn.id),
      wallIds: [quelmWall.id],
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'WALL_NOT_FOUND' }) });
    await silence();
    expect(ana.events.map(({ name }) => name)).not.toContain('wall:deletedMany');
    expect((await synced(caio, live.quelm)).walls).toEqual([quelmWall]);
  });

  it('the sync of Quelm does not carry the walls of Vharn', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    await createdBy(ana, live.vharn.id);
    const caio = await live.atTable(live.caio, live.quelm);

    expect((await synced(caio, live.quelm)).walls).toEqual([]);
  });

  it('a forged doorState in the wall is refused with INVALID_BODY', async () => {
    const ana = await live.atTable(live.ana, live.vharn);

    const ack = await send(
      ana,
      'wall:createMany',
      createOn(live.vharn.id, [{ ...NORTH_LINE, kind: 'door', doorState: 'open' }]),
    );

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
  });

  it('creating on a table not open on this connection is CAMPAIGN_NOT_FOUND', async () => {
    const ana = await live.atTable(live.ana, live.vharn);

    const ack = await send(ana, 'wall:createMany', createOn(live.quelm.id));

    expect(ack).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }),
    });
  });

  it('an undo whose wall moved since is STALE_UNDO and nothing is published', async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const wall = await createdBy(ana.client, live.vharn.id);
    await send(ana.client, 'wall:moveMany', {
      ...envelope(live.vharn.id),
      moves: [{ wallId: wall.id, x: 3, y: 5 }],
    });
    const before = ana.events.length;

    const ack = await send(ana.client, 'wall:deleteMany', {
      ...envelope(live.vharn.id),
      wallIds: [wall.id],
      expect: [{ wallId: wall.id, x: 2, y: 2 }],
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'STALE_UNDO' }) });
    await silence();
    expect(ana.events.slice(before).map(({ name }) => name)).not.toContain('wall:deletedMany');
  });

  it('the walls survive a restart of the server', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const wall = await createdBy(ana, live.vharn.id);

    await live.restart();

    const again = await live.atTable(live.bia, live.vharn);
    expect((await synced(again, live.vharn)).walls).toEqual([wall]);
  });
});

describe('erasing a piece of a wall over Socket.IO', () => {
  const live = useTokenTable();
  const GRATE = { kind: 'grate', shape: 'rectangle', x: 8, y: 3, width: 2, height: 2 } as const;

  it('Ana erasing the top side of a grate box swaps it for the rest, heard by Bia in one event', async () => {
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const ana = await live.atTable(live.ana, live.vharn);
    const created = await send(ana, 'wall:createMany', {
      ...envelope(live.vharn.id),
      walls: [GRATE],
    });
    const [boxId] = (created as { createdIds: string[] }).createdIds;

    const ack = await send(ana, 'wall:eraseSegment', {
      ...envelope(live.vharn.id),
      wallId: boxId,
      segmentIndex: 0,
    });

    expect(ack).toMatchObject({ ok: true, version: 2, createdIds: [expect.any(String)] });
    expect(await eventPayload(bia, 'wall:segmentErased')).toMatchObject({
      version: 2,
      wallId: boxId,
      walls: [{ kind: 'grate', shape: 'freehand', x: 8, y: 3, width: 2, height: 2 }],
    });
    expect((await synced(ana, live.vharn)).walls.map(({ shape }) => shape)).toEqual(['freehand']);
  });

  it('a piece the wall does not have is WALL_SEGMENT_NOT_FOUND and the box stays', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const created = await send(ana, 'wall:createMany', {
      ...envelope(live.vharn.id),
      walls: [GRATE],
    });
    const [boxId] = (created as { createdIds: string[] }).createdIds;

    const ack = await send(ana, 'wall:eraseSegment', {
      ...envelope(live.vharn.id),
      wallId: boxId,
      segmentIndex: 4,
    });

    expect(ack).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'WALL_SEGMENT_NOT_FOUND' }),
    });
    expect((await synced(ana, live.vharn)).walls.map(({ id }) => id)).toEqual([boxId]);
  });

  it('Bia erasing a piece is FORBIDDEN', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const created = await send(ana, 'wall:createMany', {
      ...envelope(live.vharn.id),
      walls: [GRATE],
    });
    const [boxId] = (created as { createdIds: string[] }).createdIds;
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'wall:eraseSegment', {
      ...envelope(live.vharn.id),
      wallId: boxId,
      segmentIndex: 0,
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
  });
});

describe('erasing an area of walls over Socket.IO', () => {
  const live = useTokenTable();
  const NORTH = {
    kind: 'wall',
    shape: 'line',
    x: 2,
    y: 2,
    width: 4,
    height: 0,
    points: [
      [0, 0],
      [4, 0],
    ],
  } as const;
  const BOX = { x: 3, y: 1, width: 2, height: 2 };

  it('Ana erasing the middle of the north wall swaps it for its two ends, heard by Bia in one event', async () => {
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const ana = await live.atTable(live.ana, live.vharn);
    const created = await send(ana, 'wall:createMany', {
      ...envelope(live.vharn.id),
      walls: [NORTH],
    });
    const [northId] = (created as { createdIds: string[] }).createdIds;

    const ack = await send(ana, 'wall:eraseArea', { ...envelope(live.vharn.id), box: BOX });

    expect(ack).toMatchObject({
      ok: true,
      version: 2,
      createdIds: [expect.any(String), expect.any(String)],
    });
    expect(await eventPayload(bia, 'wall:areaErased')).toMatchObject({
      version: 2,
      wallIds: [northId],
      walls: [
        { shape: 'line', x: 2, width: 1 },
        { shape: 'line', x: 5, width: 1 },
      ],
    });
    expect((await synced(ana, live.vharn)).walls.map(({ x }) => x)).toEqual([2, 5]);
  });

  it('Bia erasing an area is FORBIDDEN and the wall stays', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    await send(ana, 'wall:createMany', { ...envelope(live.vharn.id), walls: [NORTH] });
    const bia = await live.atTable(live.bia, live.vharn);

    const ack = await send(bia, 'wall:eraseArea', { ...envelope(live.vharn.id), box: BOX });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    expect((await synced(ana, live.vharn)).walls).toHaveLength(1);
  });
});
