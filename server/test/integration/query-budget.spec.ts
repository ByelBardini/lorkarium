import { combatStartedDto, tokenCreatedDto, tokensCreatedDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { WallsDao } from '../../src/modules/walls/walls.dao';
import { envelope, eventPayload, send, synced } from '../support/live-table';
import { recordEventsOf, type EventRecorder } from '../support/realtime-client';
import { tokenCommandFor, useTokenTable } from '../support/token-table';

// The ceiling of statements each hot command sends (docs/context/server.md, Desempenho, with the
// rule that holds each number): one more query in a DAO turns its `it` red.
const BUDGET = {
  dragMany: 1,
  move: 9,
  moveAgain: 8,
  createMany64: 9,
  nextTurn: 10,
  sync: 15,
} as const;

const BEGIN = /^begin/i;

describe('the queries each hot board command costs', () => {
  const live = useTokenTable();

  async function counted(work: () => Promise<unknown>): Promise<number> {
    live.queries.reset();
    await work();
    return live.queries.count;
  }

  async function createdBy(master: EventRecorder, command: object): Promise<string> {
    const before = master.events.length;
    await send(master.client, 'token:create', command);
    const recorder = { ...master, events: master.events.slice(before) };
    return tokenCreatedDto.parse(await eventPayload(recorder, 'token:created')).token.id;
  }

  async function lyraOfBia(): Promise<string> {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    return createdBy(ana, tokenCommandFor(live.vharn, live.bia.id));
  }

  async function wallsOnVharn(count: number): Promise<void> {
    const scene = await new ScenesDao(live.connection.db).findActiveOf(live.vharn.id);
    if (!scene) throw new Error(`table ${live.vharn.id} has no scene`);
    const rows = Array.from({ length: count }, (_, index) => ({
      sceneId: scene.id,
      kind: 'wall' as const,
      shape: 'line' as const,
      ...{ x: `${10 + index}.00`, y: '0.00', width: '0.00', height: '10.00' },
      points: [
        [0, 0],
        [0, 10],
      ] satisfies [number, number][],
      doorState: null,
    }));
    await new WallsDao(live.connection.db).insertMany(rows);
  }

  it(`token:dragMany of a player costs at most ${BUDGET.dragMany} queries`, async () => {
    const lyra = await lyraOfBia();
    const bia = await live.atTable(live.bia, live.vharn);
    const drags = [{ tokenId: lyra, cell: { col: 4, row: 4 } }];

    const queries = await counted(() =>
      send(bia, 'token:dragMany', { ...envelope(live.vharn.id), drags }),
    );

    expect(queries).toBeLessThanOrEqual(BUDGET.dragMany);
    expect(live.queries.matching(BEGIN)).toBe(0);
  });

  it(`token:move of a player on a scene with walls costs at most ${BUDGET.move}`, async () => {
    await wallsOnVharn(20);
    const lyra = await lyraOfBia();
    const bia = await live.atTable(live.bia, live.vharn);

    const queries = await counted(() =>
      send(bia, 'token:move', { ...envelope(live.vharn.id), tokenId: lyra, col: 4, row: 4 }),
    );

    expect(queries).toBeLessThanOrEqual(BUDGET.move);
  });

  it('a table command after session:join reads neither the session, the user nor the membership', async () => {
    const lyra = await lyraOfBia();
    const bia = await live.atTable(live.bia, live.vharn);
    const move = { ...envelope(live.vharn.id), tokenId: lyra, col: 5, row: 5 };

    await counted(() => send(bia, 'token:move', move));

    expect(live.queries.matching(/from "(auth_sessions|users|campaign_members)"/)).toBe(0);
  });

  it(`the next token:move of the same player reads no wall and costs at most ${BUDGET.moveAgain}`, async () => {
    await wallsOnVharn(20);
    const lyra = await lyraOfBia();
    const bia = await live.atTable(live.bia, live.vharn);
    await send(bia, 'token:move', { ...envelope(live.vharn.id), tokenId: lyra, col: 4, row: 4 });

    const queries = await counted(() =>
      send(bia, 'token:move', { ...envelope(live.vharn.id), tokenId: lyra, col: 4, row: 5 }),
    );

    expect(queries).toBeLessThanOrEqual(BUDGET.moveAgain);
    expect(live.queries.matching(/from "walls"/)).toBe(0);
  });

  it(`token:createMany of 64 costs at most ${BUDGET.createMany64}`, async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const tokens = Array.from({ length: 64 }, (_, index) => {
      const at = { col: index % 16, row: Math.floor(index / 16) };
      const item: Record<string, unknown> = { ...tokenCommandFor(live.vharn, live.bia.id, at) };
      delete item.actionId;
      delete item.campaignId;
      return item;
    });

    const queries = await counted(() =>
      send(ana.client, 'token:createMany', { ...envelope(live.vharn.id), tokens }),
    );

    expect(
      tokensCreatedDto.parse(await eventPayload(ana, 'token:createdMany')).tokens,
    ).toHaveLength(64);
    expect(queries).toBeLessThanOrEqual(BUDGET.createMany64);
  });

  it(`combat:nextTurn with 4 entries and conditions costs at most ${BUDGET.nextTurn}`, async () => {
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const ids: string[] = [];
    for (const col of [1, 2, 3, 4]) {
      ids.push(await createdBy(ana, tokenCommandFor(live.vharn, live.bia.id, { col })));
    }
    const entries = ids.map((id) => ({ name: null, tokenIds: [id] }));
    await send(ana.client, 'combat:start', { ...envelope(live.vharn.id), entries });
    const combat = combatStartedDto.parse(await eventPayload(ana, 'combat:started')).combat;
    const definitions = (await synced(ana.client, live.vharn)).conditionDefinitions;
    for (const [index, tokenId] of ids.slice(0, 3).entries()) {
      const conditionId = definitions[index]?.id;
      await send(ana.client, 'condition:apply', {
        ...{ ...envelope(live.vharn.id), tokenId, conditionId, rounds: 2 },
      });
    }
    const fromCombatantId = combat.currentCombatantId;

    const queries = await counted(() =>
      send(ana.client, 'combat:nextTurn', { ...envelope(live.vharn.id), fromCombatantId }),
    );

    expect(queries).toBeLessThanOrEqual(BUDGET.nextTurn);
  });

  it(`board:sync reads everything in one read-only snapshot and costs at most ${BUDGET.sync}`, async () => {
    await lyraOfBia();
    const bia = await live.atTable(live.bia, live.vharn);

    const queries = await counted(() => synced(bia, live.vharn));

    expect(queries).toBeLessThanOrEqual(BUDGET.sync);
    expect(live.queries.matching(BEGIN)).toBe(1);
    expect(live.queries.matching(/^begin isolation level repeatable read read only$/i)).toBe(1);
  });
});
