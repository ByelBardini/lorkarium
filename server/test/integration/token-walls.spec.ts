import { describe, expect, it } from 'vitest';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { WallsDao } from '../../src/modules/walls/walls.dao';
import type { NewWallPo } from '../../src/modules/walls/walls.po';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import type { Table } from '../support/tables';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

// Lyra stands at (3, 4), center (3.5, 4.5); the wall runs down x = 5 from y = 0 to 10.
const ACROSS = { col: 7, row: 4 };
const AROUND = [
  { col: 3, row: 10 },
  { col: 7, row: 10 },
];

describe('walls barring tokens over Socket.IO', () => {
  const live = useTokenTable();

  async function wallOn(table: Table, overrides: Partial<NewWallPo> = {}): Promise<string> {
    const scene = await new ScenesDao(live.connection.db).findActiveOf(table.id);
    if (!scene) throw new Error(`table ${table.id} has no scene`);
    const [saved] = await new WallsDao(live.connection.db).insertMany([
      {
        sceneId: scene.id,
        kind: 'wall',
        shape: 'line',
        x: '5.00',
        y: '0.00',
        width: '0.00',
        height: '10.00',
        points: [
          [0, 0],
          [0, 10],
        ],
        doorState: null,
        ...overrides,
      },
    ]);
    if (!saved) throw new Error('the wall was not saved');
    return saved.id;
  }

  async function lyraOfBia(): Promise<{ id: string; bia: RealtimeClient }> {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    await send(ana.client, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
    const lyra = await createdTokenOf(ana);
    return { id: lyra.id, bia: await live.atTable(live.bia, live.vharn) };
  }

  function moveOf(tokenId: string, to: object, extra: object = {}): object {
    return { ...envelope(live.vharn.id), tokenId, ...to, ...extra };
  }

  it('Bia moving Lyra across the wall is WALL_BLOCKED, no event, and the cell stays in the sync', async () => {
    await wallOn(live.vharn);
    const { id, bia } = await lyraOfBia();
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));

    const ack = await send(bia, 'token:move', moveOf(id, ACROSS));

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'WALL_BLOCKED' }) });
    await silence();
    expect(ana.events.map(({ name }) => name)).not.toContain('token:moved');
    expect((await synced(bia, live.vharn)).tokens[0]).toMatchObject({ col: 3, row: 4 });
  });

  it('a wall Ana draws in the way after a first move of Bia bars the next one (the remembered walls are forgotten)', async () => {
    const { id, bia } = await lyraOfBia();
    const ana = await live.atTable(live.ana, live.vharn);
    expect(await send(bia, 'token:move', moveOf(id, { col: 3, row: 5 }))).toMatchObject({
      ok: true,
    });
    const line = { kind: 'wall', shape: 'line', x: 5, y: 0, width: 0, height: 10 };
    const points = [
      [0, 0],
      [0, 10],
    ];
    await send(ana, 'wall:createMany', {
      ...envelope(live.vharn.id),
      walls: [{ ...line, points }],
    });

    const ack = await send(bia, 'token:move', moveOf(id, { col: 7, row: 5 }));

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'WALL_BLOCKED' }) });
  });

  it('with the path around the end of the wall, Ana and Caio hear token:moved', async () => {
    await wallOn(live.vharn);
    const { id, bia } = await lyraOfBia();
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));

    const ack = await send(bia, 'token:move', moveOf(id, ACROSS, { path: AROUND }));

    expect(ack).toMatchObject({ ok: true });
    for (const recorder of [ana, caio]) {
      expect(await eventPayload(recorder, 'token:moved')).toMatchObject({ tokenId: id, ...ACROSS });
    }
  });

  it('Ana, the master, moves Lyra straight across the wall', async () => {
    await wallOn(live.vharn);
    const { id } = await lyraOfBia();
    const ana = await live.atTable(live.ana, live.vharn);

    expect(await send(ana, 'token:move', moveOf(id, ACROSS))).toMatchObject({ ok: true });
  });

  it('a group of Bia where one token crosses is refused whole', async () => {
    await wallOn(live.vharn);
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    await send(ana.client, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
    const lyra = await createdTokenOf(ana);
    await send(
      ana.client,
      'token:create',
      tokenCommandFor(live.vharn, live.bia.id, { col: 1, row: 1 }),
    );
    const bia = await live.atTable(live.bia, live.vharn);
    const [, second] = (await synced(bia, live.vharn)).tokens;
    if (!second) throw new Error('the second token was not created');

    const ack = await send(bia, 'token:moveMany', {
      ...envelope(live.vharn.id),
      moves: [
        { tokenId: second.id, col: 1, row: 2 },
        { tokenId: lyra.id, ...ACROSS },
      ],
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'WALL_BLOCKED' }) });
    expect((await synced(bia, live.vharn)).tokens.map(({ col, row }) => [col, row])).toEqual([
      [3, 4],
      [1, 1],
    ]);
  });

  it('the undo of a move around the wall goes back by the reversed path with expect', async () => {
    await wallOn(live.vharn);
    const { id, bia } = await lyraOfBia();
    await send(bia, 'token:move', moveOf(id, ACROSS, { path: AROUND }));

    const ack = await send(bia, 'token:moveMany', {
      ...envelope(live.vharn.id),
      moves: [{ tokenId: id, col: 3, row: 4, expect: ACROSS, path: [...AROUND].reverse() }],
    });

    expect(ack).toMatchObject({ ok: true });
  });

  it.each([
    ['a grate', { kind: 'grate' as const }, 'WALL_BLOCKED'],
    [
      'a closed door',
      { kind: 'door' as const, doorState: 'closed' as const, height: '10.00' },
      'WALL_BLOCKED',
    ],
    ['an open door', { kind: 'door' as const, doorState: 'open' as const }, null],
  ])('%s across the move gives %s', async (_name, overrides, code) => {
    await wallOn(live.vharn, overrides);
    const { id, bia } = await lyraOfBia();

    const ack = await send(bia, 'token:move', moveOf(id, ACROSS));

    if (code) expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code }) });
    else expect(ack).toMatchObject({ ok: true });
  });

  it('a wall of Quelm does not bar a token of Vharn', async () => {
    await wallOn(live.quelm);
    const { id, bia } = await lyraOfBia();

    expect(await send(bia, 'token:move', moveOf(id, ACROSS))).toMatchObject({ ok: true });
  });
});
