import { combatStartedDto, tokenCreatedDto, tokensCreatedDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { AssetsDao } from '../../src/modules/assets/assets.dao';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { WallsDao } from '../../src/modules/walls/walls.dao';
import { newAssetPo } from '../support/assets-factories';
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
  setDoor: 10,
  setDoorMaster: 6,
  setDoorOff: 6,
} as const;

const BEGIN = /^begin/i;

const READS_AN_ASSET = /from "assets"/;

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

  describe('wall:setDoor and the tokens that block sight', () => {
    const GRID = {
      widthCells: 20,
      heightCells: 12,
      cellDistance: 1.5,
      cellUnit: 'm',
      gridVisible: true,
      gridOpacity: 30,
    };
    // Beside Lyra at (3, 4), who sees 4 cells.
    const DOOR = {
      kind: 'door',
      shape: 'line',
      ...{ x: 5, y: 3, width: 0, height: 3 },
      points: [
        [0, 0],
        [0, 3],
      ],
    };

    async function doorOnVharn(
      vision: 'dark' | 'off',
    ): Promise<EventRecorder & { doorId: string }> {
      const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
      const scene = { ...envelope(live.vharn.id), ...GRID, vision };
      await send(ana.client, 'scene:configure', scene);
      const sight = { bright: 4, dim: 0 };
      await createdBy(ana, tokenCommandFor(live.vharn, live.bia.id, { sight }));
      const walls = { ...envelope(live.vharn.id), walls: [DOOR] };
      const ack = await send(ana.client, 'wall:createMany', walls);
      const [doorId] = (ack as { createdIds: string[] }).createdIds;
      if (!doorId) throw new Error('the door was not created');
      return { ...ana, doorId };
    }

    // Far from the door, with an image: it costs its outline and hides nothing.
    async function farStatueWithImage(ana: EventRecorder): Promise<void> {
      const image = newAssetPo({ campaignId: live.vharn.id });
      const { id } = await new AssetsDao(live.connection.db).insert(image);
      const statue = { col: 15, row: 8, blocksSight: true, imageAssetId: id, name: 'Estátua' };
      await createdBy(ana, tokenCommandFor(live.vharn, live.caio.id, statue));
    }

    function openDoor(doorId: string): object {
      return { ...envelope(live.vharn.id), wallId: doorId, state: 'open' };
    }

    it(`a player's door with no blocker on the scene reads no asset and costs at most ${BUDGET.setDoor}`, async () => {
      const { doorId } = await doorOnVharn('dark');
      const bia = await live.atTable(live.bia, live.vharn);

      const queries = await counted(() => send(bia, 'wall:setDoor', openDoor(doorId)));

      expect(live.queries.matching(READS_AN_ASSET)).toBe(0);
      expect(queries).toBeLessThanOrEqual(BUDGET.setDoor);
    });

    it(`a blocker with an image adds its one read of outlines, at most ${BUDGET.setDoor + 1}`, async () => {
      const ana = await doorOnVharn('dark');
      await farStatueWithImage(ana);
      const bia = await live.atTable(live.bia, live.vharn);

      const queries = await counted(() => send(bia, 'wall:setDoor', openDoor(ana.doorId)));

      expect(live.queries.matching(READS_AN_ASSET)).toBe(1);
      expect(queries).toBeLessThanOrEqual(BUDGET.setDoor + 1);
    });

    it(`the master reads no asset, even with a blocker, and costs at most ${BUDGET.setDoorMaster}`, async () => {
      const ana = await doorOnVharn('dark');
      await farStatueWithImage(ana);

      const queries = await counted(() => send(ana.client, 'wall:setDoor', openDoor(ana.doorId)));

      expect(live.queries.matching(READS_AN_ASSET)).toBe(0);
      expect(queries).toBeLessThanOrEqual(BUDGET.setDoorMaster);
    });

    it(`with the vision off a player reads no asset nor token, and costs at most ${BUDGET.setDoorOff}`, async () => {
      const ana = await doorOnVharn('off');
      await farStatueWithImage(ana);
      const bia = await live.atTable(live.bia, live.vharn);

      const queries = await counted(() => send(bia, 'wall:setDoor', openDoor(ana.doorId)));

      expect(live.queries.matching(READS_AN_ASSET)).toBe(0);
      expect(live.queries.matching(/from "tokens"/)).toBe(0);
      expect(queries).toBeLessThanOrEqual(BUDGET.setDoorOff);
    });
  });

  describe('group writes cost the same for a small group as for a large one', () => {
    const GROUP_BUDGET = {
      applyMany: 12,
      lightGroup: 6,
      lightsCreateMany: 6,
      combatStart: 17,
      regroupOwn: 15,
      moveInTie: 12,
    } as const;

    function createdIdsOf(ack: Awaited<ReturnType<typeof send>>): string[] {
      if (!ack.ok || !ack.createdIds)
        throw new Error(`expected created ids, got ${JSON.stringify(ack)}`);
      return ack.createdIds;
    }

    async function tokensOnVharn(ana: EventRecorder, count: number): Promise<string[]> {
      const tokens = Array.from({ length: count }, (_, index) => {
        const at = { col: index % 16, row: Math.floor(index / 16), bars: [] };
        const item: Record<string, unknown> = { ...tokenCommandFor(live.vharn, live.bia.id, at) };
        delete item.actionId;
        delete item.campaignId;
        return item;
      });
      const ack = await send(ana.client, 'token:createMany', {
        ...envelope(live.vharn.id),
        tokens,
      });
      return createdIdsOf(ack);
    }

    async function lightsOnVharn(ana: EventRecorder, count: number): Promise<string[]> {
      const lights = Array.from({ length: count }, (_, index) => ({
        ...{ x: (index % 8) + 0.5, y: Math.floor(index / 8) + 0.5, bright: 2, dim: 2 },
      }));
      const ack = await send(ana.client, 'light:createMany', {
        ...envelope(live.vharn.id),
        lights,
      });
      return createdIdsOf(ack);
    }

    async function stackingUpTo2(ana: EventRecorder): Promise<string> {
      const define = { ...envelope(live.vharn.id), name: 'Sangrando', tone: 'harm' };
      await send(ana.client, 'condition:define', { ...define, icon: 'droplet', maxStacks: 2 });
      const definitions = (await synced(ana.client, live.vharn)).conditionDefinitions;
      const sangrando = definitions.find(({ name }) => name === 'Sangrando');
      if (!sangrando) throw new Error(`"Sangrando" is not among ${JSON.stringify(definitions)}`);
      return sangrando.id;
    }

    async function appliedMany(ana: EventRecorder, count: number): Promise<number> {
      const tokenIds = await tokensOnVharn(ana, count);
      const conditionId = await stackingUpTo2(ana);
      const command = { ...envelope(live.vharn.id), tokenIds, conditionId, rounds: 2 };
      return counted(() => send(ana.client, 'condition:applyMany', command));
    }

    it(`condition:applyMany costs at most ${GROUP_BUDGET.applyMany}, for 2 tokens as for 64`, async () => {
      const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
      const two = await appliedMany(ana, 2);
      const sixtyFour = await appliedMany(ana, 64);

      expect(sixtyFour).toBe(two);
      expect(sixtyFour).toBeLessThanOrEqual(GROUP_BUDGET.applyMany);
    });

    it('condition:applyMany three times keeps every token at the 2 stacks of the cap', async () => {
      const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
      const tokenIds = await tokensOnVharn(ana, 3);
      const conditionId = await stackingUpTo2(ana);
      for (let time = 0; time < 3; time += 1)
        await send(ana.client, 'condition:applyMany', {
          ...{ ...envelope(live.vharn.id), tokenIds, conditionId, rounds: 0 },
        });

      const board = await synced(ana.client, live.vharn);
      const stacks = tokenIds.map(
        (id) => board.tokens.find((token) => token.id === id)?.conditions[0]?.stacks,
      );
      expect(stacks).toEqual([2, 2, 2]);
    });

    type LightGroup = readonly [string, string, (lightId: string) => object];
    const LIGHT_GROUPS: readonly LightGroup[] = [
      ['light:moveMany', 'moves', (lightId: string) => ({ lightId, x: 9.5, y: 9.5 })],
      ['light:setRangeMany', 'changes', (lightId: string) => ({ lightId, bright: 3, dim: 5 })],
      ['light:setColorMany', 'changes', (lightId: string) => ({ lightId, color: 'fire' })],
      ['light:setConeMany', 'changes', (lightId: string) => ({ lightId, facing: 90, angle: 60 })],
    ];

    it.each(LIGHT_GROUPS)(
      `%s costs at most ${GROUP_BUDGET.lightGroup}, for 2 lights as for 64`,
      async (event, key, changeOf) => {
        const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
        const ids = await lightsOnVharn(ana, 64);
        const sent = (group: readonly string[]) =>
          counted(() =>
            send(ana.client, event, { ...envelope(live.vharn.id), [key]: group.map(changeOf) }),
          );

        const two = await sent(ids.slice(0, 2));
        const sixtyFour = await sent(ids);

        expect(sixtyFour).toBe(two);
        expect(sixtyFour).toBeLessThanOrEqual(GROUP_BUDGET.lightGroup);
      },
    );

    it(`light:createMany of 64 costs at most ${GROUP_BUDGET.lightsCreateMany} and reads no light`, async () => {
      const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
      await lightsOnVharn(ana, 2);

      const queries = await counted(() => lightsOnVharn(ana, 64));

      expect(queries).toBeLessThanOrEqual(GROUP_BUDGET.lightsCreateMany);
      expect(live.queries.matching(/^select "id", "scene_id", "light_order"/i)).toBe(0);
    });

    it('a light of another grid in the group refuses it and moves none', async () => {
      const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
      const [mine] = await lightsOnVharn(ana, 1);
      const caio = recordEventsOf(await live.atTable(live.caio, live.quelm));
      const foreign = createdIdsOf(
        await send(caio.client, 'light:createMany', {
          ...envelope(live.quelm.id),
          lights: [{ x: 1.5, y: 1.5, bright: 2, dim: 2 }],
        }),
      );
      const moves = [mine, ...foreign].map((lightId) => ({ lightId, x: 9.5, y: 9.5 }));

      const ack = await send(ana.client, 'light:moveMany', { ...envelope(live.vharn.id), moves });

      expect(ack.ok).toBe(false);
      expect((await synced(ana.client, live.vharn)).lights.map(({ x }) => x)).toEqual([0.5]);
      expect((await synced(caio.client, live.quelm)).lights.map(({ x }) => x)).toEqual([1.5]);
    });

    function ownEntries(tokenIds: readonly string[]): object[] {
      return tokenIds.map((tokenId) => ({ name: null, tokenIds: [tokenId] }));
    }

    async function startedWith(ana: EventRecorder, entries: readonly object[]): Promise<number> {
      const queries = await counted(() =>
        send(ana.client, 'combat:start', { ...envelope(live.vharn.id), entries }),
      );
      await send(ana.client, 'combat:end', envelope(live.vharn.id));
      return queries;
    }

    it(`combat:start costs at most ${GROUP_BUDGET.combatStart}, with 2 entries as with 20`, async () => {
      const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
      const tokenIds = await tokensOnVharn(ana, 20);

      const two = await startedWith(ana, ownEntries(tokenIds.slice(0, 2)));
      const twenty = await startedWith(ana, ownEntries(tokenIds));

      expect(twenty).toBe(two);
      expect(twenty).toBeLessThanOrEqual(GROUP_BUDGET.combatStart);
    });

    it(`combat:regroupTokens into their own entries costs at most ${GROUP_BUDGET.regroupOwn}, for 2 tokens as for 20`, async () => {
      const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
      const tokenIds = await tokensOnVharn(ana, 22);
      const [pair, band] = [tokenIds.slice(0, 2), tokenIds.slice(2)];
      const entries = [pair, band].map((ids) => ({ name: 'Bando', tokenIds: ids }));
      await send(ana.client, 'combat:start', { ...envelope(live.vharn.id), entries });
      const regrouped = (ids: readonly string[]) =>
        counted(() =>
          send(ana.client, 'combat:regroupTokens', {
            ...{ ...envelope(live.vharn.id), tokenIds: ids, target: { kind: 'own' } },
          }),
        );

      const two = await regrouped(pair);
      const twenty = await regrouped(band);

      expect(twenty).toBe(two);
      expect(twenty).toBeLessThanOrEqual(GROUP_BUDGET.regroupOwn);
      const combat = (await synced(ana.client, live.vharn)).combat;
      const joined = combat?.combatants.map((entry) => entry.tokenIds.join()) ?? [];
      expect(joined.sort()).toEqual([...tokenIds].sort());
    });

    it(`combat:moveInTie costs at most ${GROUP_BUDGET.moveInTie} and the new tie order reads back`, async () => {
      const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
      const tokenIds = await tokensOnVharn(ana, 3);
      await send(ana.client, 'combat:start', {
        ...{ ...envelope(live.vharn.id), entries: ownEntries(tokenIds) },
      });
      const started = (await synced(ana.client, live.vharn)).combat;
      const second = started?.combatants[1]?.id ?? '';

      const queries = await counted(() =>
        send(ana.client, 'combat:moveInTie', {
          ...{ ...envelope(live.vharn.id), combatantId: second, direction: 'up' },
        }),
      );

      expect(queries).toBeLessThanOrEqual(GROUP_BUDGET.moveInTie);
      const order = (await synced(ana.client, live.vharn)).combat?.combatants;
      expect(order?.map((entry) => entry.tokenIds[0])).toEqual([
        tokenIds[1],
        tokenIds[0],
        tokenIds[2],
      ]);
    });

    it('combat:start with a token of another grid starts no combat', async () => {
      const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
      const [mine] = await tokensOnVharn(ana, 1);
      const caio = recordEventsOf(await live.atTable(live.caio, live.quelm));
      const foreign = await createdBy(caio, tokenCommandFor(live.quelm, live.caio.id));
      const entries = ownEntries([mine ?? '', foreign]);

      const ack = await send(ana.client, 'combat:start', { ...envelope(live.vharn.id), entries });

      expect(ack.ok).toBe(false);
      expect((await synced(ana.client, live.vharn)).combat).toBeNull();
    });
  });
});
