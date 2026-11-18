import {
  campaignLibraryDto,
  campaignResponseDto,
  libraryDto,
  librarySceneDto,
  sceneUpdatedDto,
  type UserPlan,
} from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { setAccountPlan } from '../support/account-plans';
import { gridAck, newGrid } from '../support/grids';
import { envelope, eventPayload, send } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import type { Table } from '../support/tables';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();

const WALL = {
  kind: 'wall',
  shape: 'line',
  x: 2,
  y: 2,
  width: 3,
  height: 0,
  points: [
    [0, 0],
    [3, 0],
  ],
} as const;
const DOOR = {
  ...WALL,
  kind: 'door',
  x: 5,
  y: 3,
  width: 0,
  height: 3,
  points: [
    [0, 0],
    [0, 3],
  ],
};
const GRID = {
  widthCells: 20,
  heightCells: 12,
  cellDistance: 1.5,
  cellUnit: 'm',
  gridVisible: true,
  gridOpacity: 30,
};

const readOnly = (limit = 3) => ({
  code: 'PLAN_LIMIT',
  planLimit: { resource: 'scenes', limit, plan: 'free', reason: 'readOnly' },
});

function anaOn(plan: UserPlan): Promise<void> {
  return setAccountPlan(live.connection.db, live.ana.id, plan);
}

const scenesUrl = (table: Table): string => `/api/campaigns/${table.id}/scenes`;

function rename(sceneId: string, name: string, table: Table = live.vharn) {
  const url = `${scenesUrl(table)}/${sceneId}`;
  return live.http(live.ana, { method: 'PATCH', url, payload: { name } });
}

async function gridIdsOf(table: Table): Promise<string[]> {
  const response = await live.http(live.ana, { method: 'GET', url: scenesUrl(table) });
  return libraryDto.parse(response.json()).scenes.map(({ id }) => id);
}

async function lockFlagsOf(table: Table): Promise<boolean[]> {
  const response = await live.http(live.ana, { method: 'GET', url: scenesUrl(table) });
  return libraryDto.parse(response.json()).scenes.map(({ planLocked }) => planLocked);
}

// The group grid plus `more` grids made through the library, the oldest first.
async function gridsOf(table: Table, more: number): Promise<string[]> {
  for (let made = 0; made < more; made += 1)
    await newGrid(live, live.ana, table, `Grid ${made + 2}`);
  return gridIdsOf(table);
}

// Another table of Ana's: her plan must allow it, so call it on amigo_do_dono.
async function ermo(): Promise<Table> {
  const payload = { name: 'Ermo' };
  const response = await live.http(live.ana, { method: 'POST', url: '/api/campaigns', payload });
  const { id, joinCode } = campaignResponseDto.parse(response.json()).campaign;
  return { id, joinCode: joinCode ?? '', master: live.ana };
}

// The master watches the grid first: a token:created reaches only who has the grid open.
async function tokenOn(ana: RealtimeClient, sceneId: string): Promise<string> {
  await gridAck(ana, 'scene:watch', live.vharn, sceneId);
  const events = recordEventsOf(ana);
  const command = { ...tokenCommandFor(live.vharn, live.bia.id, { bars: [] }), sceneId };
  await send(ana, 'token:create', command);
  return (await createdTokenOf(events)).id;
}

describe('a free table with 5 grids made above the plan: the 4th on is read only and play goes on', () => {
  let grids: string[] = [];
  beforeEach(async () => {
    await anaOn('amigo_do_dono');
    grids = await gridsOf(live.vharn, 4);
    await anaOn('free');
  });

  it('PATCH of the 3rd oldest is 200 and of the 4th is 403 PLAN_LIMIT readOnly', async () => {
    const third = await rename(grids[2]!, 'Salão');
    const fourth = await rename(grids[3]!, 'Cripta');

    expect(third.statusCode, third.body).toBe(200);
    expect(librarySceneDto.parse(third.json())).toMatchObject({ name: 'Salão', planLocked: false });
    expect(fourth.statusCode, fourth.body).toBe(403);
    expect(fourth.json()).toMatchObject(readOnly());
  });

  it('moving the 4th to the root is refused, and making it public passes (visibility is not setup)', async () => {
    const url = `${scenesUrl(live.vharn)}/${grids[3]}`;
    const moved = await live.http(live.ana, { method: 'PATCH', url, payload: { folderId: null } });
    const shown = await live.http(live.ana, {
      method: 'PATCH',
      url,
      payload: { visibility: 'public' },
    });

    expect(moved.statusCode, moved.body).toBe(403);
    expect(moved.json()).toMatchObject(readOnly());
    expect(shown.statusCode, shown.body).toBe(200);
    expect(librarySceneDto.parse(shown.json()).planLocked).toBe(true);
  });

  it('the library lists planLocked only from the 4th grid on, in GET scenes and in GET library', async () => {
    const aggregate = await live.http(live.ana, {
      method: 'GET',
      url: `/api/campaigns/${live.vharn.id}/library`,
    });

    expect(await lockFlagsOf(live.vharn)).toEqual([false, false, false, true, true]);
    const scenes = campaignLibraryDto.parse(aggregate.json()).scenes;
    expect(scenes.map(({ planLocked }) => planLocked)).toEqual([false, false, false, true, true]);
  });

  it('a new wall on the 5th grid is acked PLAN_LIMIT readOnly; on the 3rd it is created', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const on = (sceneId: string) => ({ ...envelope(live.vharn.id), sceneId, walls: [WALL] });

    const fifth = await send(ana, 'wall:createMany', on(grids[4]!));
    const third = await send(ana, 'wall:createMany', on(grids[2]!));

    expect(fifth).toMatchObject({ ok: false, error: readOnly() });
    expect(third).toMatchObject({ ok: true });
  });

  it('duplicating the 4th is 403 PLAN_LIMIT readOnly', async () => {
    const url = `${scenesUrl(live.vharn)}/${grids[3]}/copies`;

    const response = await live.http(live.ana, { method: 'POST', url });

    expect(response.statusCode, response.body).toBe(403);
    expect(response.json()).toMatchObject(readOnly());
  });

  it('scene:configure of the 5th refuses a new ruler and confirms the vision mode alone', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const on = { ...envelope(live.vharn.id), sceneId: grids[4], ...GRID };

    const ruler = await send(ana, 'scene:configure', { ...on, cellDistance: 3 });
    const vision = await send(ana, 'scene:configure', {
      ...on,
      actionId: crypto.randomUUID(),
      vision: 'dark',
    });

    expect(ruler).toMatchObject({ ok: false, error: readOnly() });
    expect(vision).toMatchObject({ ok: true });
  });

  it('the snapshot of the room opens the 4th grid planLocked and the 3rd not', async () => {
    const ana = await live.atTable(live.ana, live.vharn);

    const fourth = await gridAck(ana, 'board:sync', live.vharn, grids[3]!);
    const third = await gridAck(ana, 'board:sync', live.vharn, grids[2]!);

    expect(fourth).toMatchObject({
      ok: true,
      state: { scene: { id: grids[3], planLocked: true } },
    });
    expect(third).toMatchObject({
      ok: true,
      state: { scene: { id: grids[2], planLocked: false } },
    });
  });

  it.each([
    [4, { vision: 'dark' }, true],
    [2, { cellDistance: 3 }, false],
  ])(
    'scene:updated of the grid of rank %i (%o) carries planLocked %s',
    async (rank, change, locked) => {
      const ana = await live.atTable(live.ana, live.vharn);
      const sceneId = grids[rank]!;
      await gridAck(ana, 'scene:watch', live.vharn, sceneId);
      const events = recordEventsOf(ana);

      await send(ana, 'scene:configure', {
        ...envelope(live.vharn.id),
        sceneId,
        ...GRID,
        ...change,
      });

      const updated = sceneUpdatedDto.parse(await eventPayload(events, 'scene:updated'));
      expect(updated.scene).toMatchObject({ id: sceneId, planLocked: locked });
    },
  );

  it('deleting the 2nd is 204 and then the PATCH of the old 4th is 200', async () => {
    const url = `${scenesUrl(live.vharn)}/${grids[1]}`;

    const deleted = await live.http(live.ana, { method: 'DELETE', url });
    const fourth = await rename(grids[3]!, 'Cripta');

    expect(deleted.statusCode, deleted.body).toBe(204);
    expect(fourth.statusCode, fourth.body).toBe(200);
  });
});

describe('play goes on in a read only grid', () => {
  it('moving a token and opening a door on the 5th grid are confirmed', async () => {
    await anaOn('amigo_do_dono');
    const grids = await gridsOf(live.vharn, 4);
    const ana = await live.atTable(live.ana, live.vharn);
    const sceneId = grids[4]!;
    const lyra = await tokenOn(ana, sceneId);
    const door = await send(ana, 'wall:createMany', {
      ...envelope(live.vharn.id),
      sceneId,
      walls: [DOOR],
    });
    const [doorId] = (door as { createdIds: string[] }).createdIds;
    await anaOn('free');

    const move = { ...envelope(live.vharn.id), sceneId, tokenId: lyra, col: 6, row: 6 };
    const opened = { ...envelope(live.vharn.id), sceneId, wallId: doorId, state: 'open' };

    expect(await send(ana, 'token:move', move)).toMatchObject({ ok: true });
    expect(await send(ana, 'wall:setDoor', opened)).toMatchObject({ ok: true });
  });
});

describe('the rank of a grid counts only its own table', () => {
  it("Vharn's 5 grids do not count at Ana's Ermo, and Ermo's list carries no planLocked of Vharn", async () => {
    await anaOn('amigo_do_dono');
    await gridsOf(live.vharn, 4);
    const other = await ermo();
    const ermoGrids = await gridsOf(other, 2);
    await anaOn('free');

    const third = await rename(ermoGrids[2]!, 'Oásis', other);

    expect(third.statusCode, third.body).toBe(200);
    expect(await lockFlagsOf(other)).toEqual([false, false, false]);
    expect(await lockFlagsOf(live.vharn)).toEqual([false, false, false, true, true]);
  });

  it("the snapshot of Ermo's 3rd grid is not planLocked while Vharn's 4th is", async () => {
    await anaOn('amigo_do_dono');
    const vharnGrids = await gridsOf(live.vharn, 4);
    const other = await ermo();
    const ermoGrids = await gridsOf(other, 2);
    await anaOn('free');
    const atErmo = await live.atTable(live.ana, other);
    const atVharn = await live.atTable(live.ana, live.vharn);

    const ermoThird = await gridAck(atErmo, 'board:sync', other, ermoGrids[2]!);
    const vharnFourth = await gridAck(atVharn, 'board:sync', live.vharn, vharnGrids[3]!);

    expect(ermoThird).toMatchObject({ ok: true, state: { scene: { planLocked: false } } });
    expect(vharnFourth).toMatchObject({ ok: true, state: { scene: { planLocked: true } } });
  });
});
