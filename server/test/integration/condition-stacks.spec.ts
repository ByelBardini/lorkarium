import {
  combatStartedDto,
  conditionAppliedDto,
  conditionDefinedDto,
  tokenCreatedDto,
  type ActiveConditionDto,
} from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { atTable, envelope, eventPayload, send, synced } from '../support/live-table';
import {
  recordEventsOf,
  type EventRecorder,
  type RealtimeClient,
} from '../support/realtime-client';
import { signUpAndLogin, type SignedInUser } from '../support/sign-in';
import { createTable, joinByCode, type Table } from '../support/tables';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

describe('condition stacks over Socket.IO', () => {
  const env: Env = { ...readEnv(process.env), adminSeed: null };
  const clients: RealtimeClient[] = [];
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let baseUrl: string;
  let ana: SignedInUser;
  let bia: SignedInUser;
  let caio: SignedInUser;
  let vharn: Table;
  let quelm: Table;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    app = await buildApp({ env, db: connection.db });
    baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
    ana = await signUpAndLogin(app, connection.db, 'Ana');
    bia = await signUpAndLogin(app, connection.db, 'Bia');
    caio = await signUpAndLogin(app, connection.db, 'Caio');
    vharn = await createTable(app, ana, 'Os Sinos de Vharn');
    quelm = await createTable(app, caio, 'Quelm');
    await joinByCode(app, bia, vharn);
    await joinByCode(app, caio, vharn);
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.close();
    await app.close();
  });

  type Bleeding = Readonly<{
    master: RealtimeClient;
    biaClient: RealtimeClient;
    kaelId: string;
    sangrando: string;
  }>;

  // Ana defines "Sangrando" stacking up to 3 and places Kael, Caio's token.
  async function sangrandoMax3AndKael(): Promise<Bleeding> {
    const master = await atTable(baseUrl, clients, ana, vharn);
    const events = recordEventsOf(master);
    await send(master, 'token:create', {
      ...envelope(vharn.id),
      name: 'Kael',
      initials: 'KA',
      side: 'ally',
      width: 1,
      height: 1,
      col: 1,
      row: 1,
      controllerIds: [caio.id],
      bars: [],
    });
    const kaelId = tokenCreatedDto.parse(await eventPayload(events, 'token:created')).token.id;
    const define = { ...envelope(vharn.id), name: 'Sangrando', tone: 'harm', icon: 'droplet' };
    await send(master, 'condition:define', { ...define, maxStacks: 3 });
    const defined = conditionDefinedDto.parse(await eventPayload(events, 'condition:defined'));
    const biaClient = await atTable(baseUrl, clients, bia, vharn);
    return { master, biaClient, kaelId, sangrando: defined.definition.id };
  }

  function applyOn(bleeding: Bleeding, rounds = 0) {
    const { kaelId, sangrando } = bleeding;
    return { ...envelope(vharn.id), tokenId: kaelId, conditionId: sangrando, rounds };
  }

  async function kaelConditions(client: RealtimeClient): Promise<ActiveConditionDto[]> {
    const state = await synced(client, vharn);
    return state.tokens.find(({ name }) => name === 'Kael')?.conditions ?? [];
  }

  async function appliedStacks(recorder: EventRecorder, count: number): Promise<number[]> {
    const deadline = Date.now() + 2000;
    for (;;) {
      const applied = recorder.events.filter(({ name }) => name === 'condition:applied');
      if (applied.length >= count) {
        return applied.map(({ payload }) => conditionAppliedDto.parse(payload).condition.stacks);
      }
      if (Date.now() > deadline) throw new Error(`only ${applied.length} condition:applied`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  async function kaelBleeding(stacksApplied: number): Promise<Bleeding & { activeId: string }> {
    const bleeding = await sangrandoMax3AndKael();
    for (let times = 0; times < stacksApplied; times++) {
      await send(bleeding.biaClient, 'condition:apply', applyOn(bleeding));
    }
    const activeId = (await kaelConditions(bleeding.master))[0]?.id ?? '';
    return { ...bleeding, activeId };
  }

  function setStacksOn(bleeding: { kaelId: string; activeId: string }, stacks: number) {
    const { kaelId, activeId } = bleeding;
    return { ...envelope(vharn.id), tokenId: kaelId, activeConditionId: activeId, stacks };
  }

  it('Bia applying Sangrando (max 3) 4 times to Caio’s Kael reaches Caio as 1, 2, 3, 3 and the snapshot keeps 3', async () => {
    const bleeding = await sangrandoMax3AndKael();
    const caioEvents = recordEventsOf(await atTable(baseUrl, clients, caio, vharn));

    for (let times = 0; times < 4; times++) {
      expect(await send(bleeding.biaClient, 'condition:apply', applyOn(bleeding))).toMatchObject({
        ok: true,
      });
    }

    expect(await appliedStacks(caioEvents, 4)).toEqual([1, 2, 3, 3]);
    expect(await kaelConditions(caioEvents.client)).toEqual([
      expect.objectContaining({ name: 'Sangrando', stacks: 3, maxStacks: 3 }),
    ]);
  });

  it('Bia setting 2 stacks on Kael reaches Ana and Caio as condition:applied with 2', async () => {
    const bleeding = await kaelBleeding(3);
    const anaEvents = recordEventsOf(bleeding.master);
    const caioEvents = recordEventsOf(await atTable(baseUrl, clients, caio, vharn));

    const ack = await send(bleeding.biaClient, 'condition:setStacks', setStacksOn(bleeding, 2));

    expect(ack).toMatchObject({ ok: true });
    expect(await appliedStacks(anaEvents, 1)).toEqual([2]);
    expect(await appliedStacks(caioEvents, 1)).toEqual([2]);
    expect((await kaelConditions(bleeding.master))[0]?.stacks).toBe(2);
  });

  it('setting 4 stacks above the max 3 answers INVALID_STACKS and Kael keeps 1', async () => {
    const bleeding = await kaelBleeding(1);

    const ack = await send(bleeding.biaClient, 'condition:setStacks', setStacksOn(bleeding, 4));

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_STACKS' }) });
    expect((await kaelConditions(bleeding.master))[0]?.stacks).toBe(1);
  });

  it('Ana lowering the max of Sangrando to 2 brings Kael from 3 to 2 in the snapshot', async () => {
    const bleeding = await kaelBleeding(3);

    const ack = await send(bleeding.master, 'condition:updateDefinition', {
      ...envelope(vharn.id),
      conditionId: bleeding.sangrando,
      name: 'Sangrando',
      tone: 'harm',
      icon: 'droplet',
      look: null,
      description: '',
      maxStacks: 2,
      color: null,
    });

    expect(ack).toMatchObject({ ok: true });
    expect(await kaelConditions(bleeding.biaClient)).toEqual([
      expect.objectContaining({ stacks: 2, maxStacks: 2 }),
    ]);
  });

  it('Caio, master of Quelm, setting stacks on Vharn’s Kael through Quelm is TOKEN_NOT_FOUND and Kael keeps 2', async () => {
    const bleeding = await kaelBleeding(2);
    const quelmMaster = await atTable(baseUrl, clients, caio, quelm);

    const ack = await send(quelmMaster, 'condition:setStacks', {
      ...setStacksOn(bleeding, 3),
      ...envelope(quelm.id),
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'TOKEN_NOT_FOUND' }) });
    expect((await kaelConditions(bleeding.master))[0]?.stacks).toBe(2);
  });

  it('a setStacks with a forged userId is INVALID_BODY and Kael keeps 1', async () => {
    const bleeding = await kaelBleeding(1);

    const ack = await send(bleeding.biaClient, 'condition:setStacks', {
      ...setStacksOn(bleeding, 2),
      userId: ana.id,
    });

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
    expect((await kaelConditions(bleeding.master))[0]?.stacks).toBe(1);
  });

  it('a Sangrando with 2 stacks for 1 round leaves Kael whole at the end of his turn in the next round', async () => {
    const bleeding = await sangrandoMax3AndKael();
    const events = recordEventsOf(bleeding.master);
    const entries = [{ name: null, tokenIds: [bleeding.kaelId], initiative: 10 }];
    await send(bleeding.master, 'combat:start', { ...envelope(vharn.id), entries });
    const combat = combatStartedDto.parse(await eventPayload(events, 'combat:started')).combat;
    const nextTurn = { ...envelope(vharn.id), fromCombatantId: combat.combatants[0]?.id ?? '' };
    await send(bleeding.biaClient, 'condition:apply', applyOn(bleeding, 1));
    await send(bleeding.biaClient, 'condition:apply', applyOn(bleeding, 1));

    await send(bleeding.master, 'combat:nextTurn', { ...nextTurn, actionId: crypto.randomUUID() });
    const afterRound1 = await kaelConditions(bleeding.master);
    await send(bleeding.master, 'combat:nextTurn', { ...nextTurn, actionId: crypto.randomUUID() });

    expect(afterRound1.map(({ stacks, remainingRounds }) => [stacks, remainingRounds])).toEqual([
      [2, 1],
    ]);
    expect(await kaelConditions(bleeding.master)).toEqual([]);
  });
});
