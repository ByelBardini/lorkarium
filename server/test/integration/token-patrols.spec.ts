import {
  tokenMovedDto,
  tokenPatrolsChangedDto,
  veiledLightsChangedDto,
  type TokenPatrolFieldsDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { TokensDao } from '../../src/modules/tokens/tokens.dao';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';
import { expectNoTrace, hiddenTable, hideBySql } from '../support/hidden-tokens';

const ROUTE: TokenPatrolFieldsDto = {
  path: [
    [3, 4],
    [6, 4],
  ],
  repeat: 'bounce',
  speed: 1,
  turns: true,
  gait: 'glide',
};

describe('token patrols over Socket.IO', () => {
  const live = useTokenTable();

  async function lyraOfBia(master: RealtimeClient): Promise<string> {
    const events = recordEventsOf(master);
    await send(master, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
    return (await createdTokenOf(events)).id;
  }

  function setPatrol(tokenId: string, patrol: TokenPatrolFieldsDto | null = ROUTE): object {
    return { ...envelope(live.vharn.id), tokenId, patrol };
  }

  function setActive(tokenIds: string[], active: boolean): object {
    return { ...envelope(live.vharn.id), tokenIds, active };
  }

  describe('saving the route (token:setPatrol)', () => {
    it("Ana saving Lyra's route reaches Bia, and Bia's snapshot carries it", async () => {
      const master = await live.atTable(live.ana, live.vharn);
      const lyraId = await lyraOfBia(master);
      const bia = await live.atTable(live.bia, live.vharn);
      const biaEvents = recordEventsOf(bia);

      const ack = await send(master, 'token:setPatrol', setPatrol(lyraId));

      expect(ack).toEqual({ ok: true, version: 2 });
      const event = tokenPatrolsChangedDto.parse(
        await eventPayload(biaEvents, 'token:patrolsChanged'),
      );
      const patrol = { ...ROUTE, step: 0, startedAt: null };
      expect(event.changes).toEqual([{ tokenId: lyraId, patrol, col: 3, row: 4, facing: 0 }]);
      expect((await synced(bia, live.vharn)).tokens[0]?.patrol).toEqual(patrol);
    });

    it('Bia, who controls Lyra, gets FORBIDDEN and nobody hears of it', async () => {
      const master = await live.atTable(live.ana, live.vharn);
      const lyraId = await lyraOfBia(master);
      const anaEvents = recordEventsOf(master);
      const bia = await live.atTable(live.bia, live.vharn);

      const ack = await send(bia, 'token:setPatrol', setPatrol(lyraId));

      expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
      await silence();
      expect(anaEvents.events.map(({ name }) => name)).not.toContain('token:patrolsChanged');
    });

    it('a route out of the scene is OUT_OF_SCENE', async () => {
      const master = await live.atTable(live.ana, live.vharn);
      const lyraId = await lyraOfBia(master);
      const far = {
        ...ROUTE,
        path: [
          [3, 4],
          [500, 4],
        ] as [number, number][],
      };

      const ack = await send(master, 'token:setPatrol', setPatrol(lyraId, far));

      expect(ack).toEqual({
        ok: false,
        error: { code: 'OUT_OF_SCENE', message: 'It does not fit the scene there' },
      });
    });

    it("Quelm's master naming a Vharn grid is SCENE_NOT_FOUND, and Vharn hears nothing", async () => {
      const master = await live.atTable(live.ana, live.vharn);
      const lyraId = await lyraOfBia(master);
      const vharnSceneId = (await synced(master, live.vharn)).scene.id;
      const anaEvents = recordEventsOf(master);
      const quelm = await live.atTable(live.caio, live.quelm);
      const command = { ...envelope(live.quelm.id), sceneId: vharnSceneId, tokenId: lyraId };

      const ack = await send(quelm, 'token:setPatrol', { ...command, patrol: ROUTE });

      expect(ack).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'SCENE_NOT_FOUND' }),
      });
      await silence();
      expect(anaEvents.events.map(({ name }) => name)).not.toContain('token:patrolsChanged');
      expect(JSON.stringify((await synced(quelm, live.quelm)).tokens)).not.toContain(lyraId);
    });

    it('a command carrying a forged userId gets INVALID_BODY', async () => {
      const master = await live.atTable(live.ana, live.vharn);
      const lyraId = await lyraOfBia(master);

      const ack = await send(master, 'token:setPatrol', {
        ...setPatrol(lyraId),
        userId: live.bia.id,
      });

      expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
    });
  });

  describe('starting and pausing (token:setPatrolActiveMany)', () => {
    it('a started patrol keeps its startedAt across a restart of the app', async () => {
      const master = await live.atTable(live.ana, live.vharn);
      const lyraId = await lyraOfBia(master);
      await send(master, 'token:setPatrol', setPatrol(lyraId));
      const anaEvents = recordEventsOf(master);
      await send(master, 'token:setPatrolActiveMany', setActive([lyraId], true));
      const started = tokenPatrolsChangedDto.parse(
        await eventPayload(anaEvents, 'token:patrolsChanged'),
      ).changes[0]?.patrol?.startedAt;

      await live.restart();

      const state = await synced(await live.atTable(live.bia, live.vharn), live.vharn);
      expect(started).toEqual(expect.any(String));
      expect(state.tokens[0]?.patrol?.startedAt).toBe(started);
    });

    it('pausing saves startedAt null and every client hears it', async () => {
      const master = await live.atTable(live.ana, live.vharn);
      const lyraId = await lyraOfBia(master);
      await send(master, 'token:setPatrol', setPatrol(lyraId));
      await send(master, 'token:setPatrolActiveMany', setActive([lyraId], true));
      const caioEvents = recordEventsOf(await live.atTable(live.caio, live.vharn));

      const ack = await send(master, 'token:setPatrolActiveMany', setActive([lyraId], false));

      expect(ack).toEqual({ ok: true, version: 4 });
      const event = tokenPatrolsChangedDto.parse(
        await eventPayload(caioEvents, 'token:patrolsChanged'),
      );
      expect(event.changes[0]?.patrol?.startedAt).toBeNull();
    });

    it('starting a token without a route is TOKEN_PATROL_NOT_FOUND', async () => {
      const master = await live.atTable(live.ana, live.vharn);
      const lyraId = await lyraOfBia(master);

      const ack = await send(master, 'token:setPatrolActiveMany', setActive([lyraId], true));

      expect(ack).toEqual({
        ok: false,
        error: { code: 'TOKEN_PATROL_NOT_FOUND', message: 'This token has no patrol yet' },
      });
    });

    it('30 running patrols of the Quelm do not count against the Vharn', async () => {
      const quelmMaster = await live.atTable(live.caio, live.quelm);
      const quelmSceneId = (await synced(quelmMaster, live.quelm)).scene.id;
      await thirtyRunningIn(quelmSceneId);
      const master = await live.atTable(live.ana, live.vharn);
      const lyraId = await lyraOfBia(master);
      await send(master, 'token:setPatrol', setPatrol(lyraId));

      const ack = await send(master, 'token:setPatrolActiveMany', setActive([lyraId], true));

      expect(ack).toEqual({ ok: true, version: 3 });
    });

    it('the 31st running patrol of a grid is TOKEN_PATROL_LIMIT', async () => {
      const master = await live.atTable(live.ana, live.vharn);
      const vharnSceneId = (await synced(master, live.vharn)).scene.id;
      await thirtyRunningIn(vharnSceneId);
      const lyraId = await lyraOfBia(master);
      await send(master, 'token:setPatrol', setPatrol(lyraId));

      const ack = await send(master, 'token:setPatrolActiveMany', setActive([lyraId], true));

      expect(ack).toEqual({
        ok: false,
        error: { code: 'TOKEN_PATROL_LIMIT', message: 'A grid keeps at most 30 patrols running' },
      });
    });

    it("Vharn's master starting from the Quelm table is SCENE_NOT_FOUND", async () => {
      const master = await live.atTable(live.ana, live.vharn);
      const lyraId = await lyraOfBia(master);
      const vharnSceneId = (await synced(master, live.vharn)).scene.id;
      const quelm = await live.atTable(live.caio, live.quelm);
      const command = { ...envelope(live.quelm.id), sceneId: vharnSceneId, tokenIds: [lyraId] };

      const ack = await send(quelm, 'token:setPatrolActiveMany', { ...command, active: true });

      expect(ack).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'SCENE_NOT_FOUND' }),
      });
    });
  });

  describe('moving by hand pauses (token:move)', () => {
    it('Bia gets token:moved with where the patrol stopped, and the snapshot then has it paused', async () => {
      const master = await live.atTable(live.ana, live.vharn);
      const lyraId = await lyraOfBia(master);
      await send(master, 'token:setPatrol', setPatrol(lyraId));
      await send(master, 'token:setPatrolActiveMany', setActive([lyraId], true));
      const bia = await live.atTable(live.bia, live.vharn);
      const biaEvents = recordEventsOf(bia);

      await send(master, 'token:move', {
        ...envelope(live.vharn.id),
        tokenId: lyraId,
        col: 8,
        row: 8,
      });

      const moved = tokenMovedDto.parse(await eventPayload(biaEvents, 'token:moved'));
      expect(moved.patrolPauses).toEqual([
        { tokenId: lyraId, col: 8, row: 8, facing: expect.any(Number), step: expect.any(Number) },
      ]);
      const state = await synced(bia, live.vharn);
      expect(state.tokens[0]?.patrol?.startedAt).toBeNull();
      expect(state.tokens[0]).toMatchObject({ col: 8, row: 8 });
    });
  });

  describe('hidden tokens on patrol', () => {
    it('Bia never gets the route of a hidden token she does not control, in events or snapshot', async () => {
      const master = await live.atTable(live.ana, live.vharn);
      const events = recordEventsOf(master);
      await send(
        master,
        'token:create',
        tokenCommandFor(live.vharn, live.ana.id, { name: 'Sombra' }),
      );
      const sombraId = (await createdTokenOf(events)).id;
      await hideBySql(live, [sombraId]);
      const bia = await live.atTable(live.bia, live.vharn);
      const biaEvents = recordEventsOf(bia);

      await send(master, 'token:setPatrol', setPatrol(sombraId));
      await send(master, 'token:setPatrolActiveMany', setActive([sombraId], true));
      await send(master, 'token:move', {
        ...envelope(live.vharn.id),
        tokenId: sombraId,
        col: 9,
        row: 9,
      });

      await silence();
      expect(biaEvents.events.map(({ name }) => name)).toContain('board:advanced');
      expectNoTrace(biaEvents, sombraId);
      expect(JSON.stringify(await synced(bia, live.vharn))).not.toContain(sombraId);
    });

    it("Caio gets the hidden Lobo's torch walking with its patrol, and standing once it pauses", async () => {
      const table = await hiddenTable(live);
      const master = table.ana.client;
      await send(master, 'token:setPatrol', setPatrol(table.loboId));
      await silence();
      const caioEvents = recordEventsOf(table.caio.client);

      await send(master, 'token:setPatrolActiveMany', setActive([table.loboId], true));

      const walking = veiledLightsChangedDto.parse(
        await eventPayload(caioEvents, 'token:veiledLightsChanged'),
      );
      expect(walking.lights[0]?.walk).toMatchObject({ col: 3, row: 4, width: 2, height: 2 });
      const caio = table.caio.client;
      expect((await synced(caio, live.vharn)).veiledLights[0]?.walk?.patrol.startedAt).toEqual(
        expect.any(String),
      );
      await send(master, 'token:setPatrolActiveMany', setActive([table.loboId], false));
      expect((await synced(caio, live.vharn)).veiledLights[0]).not.toHaveProperty('walk');
      expectNoTrace(table.caio, table.loboId);
    });
  });

  // Thirty walkers straight through the DAO, already running.
  async function thirtyRunningIn(sceneId: string): Promise<void> {
    const tokens = new TokensDao(live.connection.db);
    const token = { sceneId, initials: 'GU', side: 'enemy' as const, width: 1, height: 1 };
    const rows = Array.from({ length: 30 }, (_, index) => ({
      token: { ...token, name: `Guarda ${index}`, col: 0, row: index % 10 },
      bars: [],
      controllerIds: [],
    }));
    const saved = await tokens.insertMany(rows);
    for (const { token: guard } of saved) {
      const path: [number, number][] = [
        [0, guard.row],
        [2, guard.row],
      ];
      const patrol = { tokenId: guard.id, path, repeat: 'bounce' as const, speed: '1.00' };
      await tokens.patrols.save(sceneId, {
        ...patrol,
        turns: true,
        gait: 'glide',
        step: 0,
        startedAt: new Date(),
      });
    }
  }
});
