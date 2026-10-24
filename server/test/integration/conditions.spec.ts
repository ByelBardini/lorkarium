import {
  combatStartedDto,
  combatTurnChangedDto,
  conditionAppliedDto,
  conditionsAppliedDto,
  tokenCreatedDto,
  type BoardStateDto,
} from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { atTable, envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import { signUpAndLogin, type SignedInUser } from '../support/sign-in';
import { createTable, joinByCode, type Table } from '../support/tables';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

describe('conditions over Socket.IO', () => {
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

  async function lyraOfBia(master: RealtimeClient): Promise<string> {
    return placedToken(master, 'Lyra', bia.id, 1);
  }

  async function placedToken(
    master: RealtimeClient,
    name: string,
    controllerId: string,
    col: number,
  ): Promise<string> {
    const recorder = recordEventsOf(master);
    await send(master, 'token:create', {
      ...envelope(vharn.id),
      name,
      initials: name.slice(0, 2).toUpperCase(),
      side: 'ally',
      width: 1,
      height: 1,
      col,
      row: 1,
      controllerIds: [controllerId],
      bars: [],
    });
    return tokenCreatedDto.parse(await eventPayload(recorder, 'token:created')).token.id;
  }

  function definitionId(state: BoardStateDto, name: string): string {
    const found = state.conditionDefinitions.find((definition) => definition.name === name);
    if (!found) throw new Error(`no condition named ${name} in the snapshot`);
    return found.id;
  }

  it('the snapshot brings the table’s 11 conditions', async () => {
    const state = await synced(await atTable(baseUrl, clients, bia, vharn), vharn);
    expect(state.conditionDefinitions).toHaveLength(11);
  });

  it('Bia applying "Abençoado 2" to her token reaches everyone, and the snapshot shows it', async () => {
    const master = await atTable(baseUrl, clients, ana, vharn);
    const lyraId = await lyraOfBia(master);
    const biaClient = await atTable(baseUrl, clients, bia, vharn);
    const caioEvents = recordEventsOf(await atTable(baseUrl, clients, caio, vharn));
    const abencoado = definitionId(await synced(biaClient, vharn), 'Abençoado');
    const apply = { ...envelope(vharn.id), tokenId: lyraId, conditionId: abencoado, rounds: 2 };
    expect(await send(biaClient, 'condition:apply', apply)).toMatchObject({ ok: true });
    const applied = conditionAppliedDto.parse(await eventPayload(caioEvents, 'condition:applied'));
    expect(applied.condition).toMatchObject({ name: 'Abençoado', remainingRounds: 2 });
    const state = await synced(caioEvents.client, vharn);
    expect(state.tokens[0]?.conditions).toEqual([applied.condition]);
  });

  it('Caio applying Cego to Bia’s Lyra, which he does not control, reaches Bia and the snapshot', async () => {
    const master = await atTable(baseUrl, clients, ana, vharn);
    const lyraId = await lyraOfBia(master);
    const biaEvents = recordEventsOf(await atTable(baseUrl, clients, bia, vharn));
    const caioClient = await atTable(baseUrl, clients, caio, vharn);
    const cego = definitionId(await synced(caioClient, vharn), 'Cego');
    const apply = { ...envelope(vharn.id), tokenId: lyraId, conditionId: cego, rounds: 1 };

    expect(await send(caioClient, 'condition:apply', apply)).toMatchObject({ ok: true });

    const applied = conditionAppliedDto.parse(await eventPayload(biaEvents, 'condition:applied'));
    expect([applied.tokenId, applied.condition.name]).toEqual([lyraId, 'Cego']);
    const lyra = (await synced(master, vharn)).tokens.find(({ id }) => id === lyraId);
    expect(lyra?.conditions.map(({ name }) => name)).toEqual(['Cego']);
  });

  it('Bia removing the Cego the master put on Caio’s Bram reaches Caio and leaves the Bram clean', async () => {
    const master = await atTable(baseUrl, clients, ana, vharn);
    const bramId = await placedToken(master, 'Bram', caio.id, 3);
    const cego = definitionId(await synced(master, vharn), 'Cego');
    await send(master, 'condition:apply', {
      ...envelope(vharn.id),
      tokenId: bramId,
      conditionId: cego,
      rounds: 0,
    });
    const activeId = (await synced(master, vharn)).tokens[0]?.conditions[0]?.id ?? '';
    const caioEvents = recordEventsOf(await atTable(baseUrl, clients, caio, vharn));
    const biaClient = await atTable(baseUrl, clients, bia, vharn);

    const ack = await send(biaClient, 'condition:remove', {
      ...envelope(vharn.id),
      tokenId: bramId,
      activeConditionId: activeId,
    });

    expect(ack).toMatchObject({ ok: true });
    expect(await eventPayload(caioEvents, 'condition:removed')).toMatchObject({
      tokenId: bramId,
      activeConditionId: activeId,
    });
    expect((await synced(biaClient, vharn)).tokens[0]?.conditions).toEqual([]);
  });

  it('a condition of another table is CONDITION_NOT_FOUND', async () => {
    const master = await atTable(baseUrl, clients, ana, vharn);
    const lyraId = await lyraOfBia(master);
    const quelmCego = definitionId(
      await synced(await atTable(baseUrl, clients, caio, quelm), quelm),
      'Cego',
    );
    const apply = { ...envelope(vharn.id), tokenId: lyraId, conditionId: quelmCego, rounds: 1 };
    expect(await send(master, 'condition:apply', apply)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'CONDITION_NOT_FOUND' }),
    });
  });

  it('the master defining "Sangrando" reaches everyone; a player defining is FORBIDDEN', async () => {
    const master = await atTable(baseUrl, clients, ana, vharn);
    const biaEvents = recordEventsOf(await atTable(baseUrl, clients, bia, vharn));
    expect(
      await send(master, 'condition:define', {
        ...envelope(vharn.id),
        name: 'Sangrando',
        tone: 'harm',
        icon: 'droplet',
      }),
    ).toMatchObject({
      ok: true,
    });
    expect(await eventPayload(biaEvents, 'condition:defined')).toMatchObject({
      definition: { name: 'Sangrando', tone: 'harm', icon: 'droplet' },
    });
    const refused = await send(biaEvents.client, 'condition:define', {
      ...envelope(vharn.id),
      name: 'Furtivo',
      tone: 'benefit',
      icon: 'ghost',
    });
    expect(refused).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
  });

  it('the master defining "Inconsciente" incapacitating and unconscious reaches the table with both, and applying it carries the look', async () => {
    const master = await atTable(baseUrl, clients, ana, vharn);
    const lyraId = await lyraOfBia(master);
    const biaEvents = recordEventsOf(await atTable(baseUrl, clients, bia, vharn));
    const caioEvents = recordEventsOf(await atTable(baseUrl, clients, caio, vharn));
    const quelmEvents = recordEventsOf(await atTable(baseUrl, clients, caio, quelm));
    const define = { ...envelope(vharn.id), name: 'Inconsciente', tone: 'incapacitating' };
    await send(master, 'condition:define', { ...define, icon: 'moon', look: 'unconscious' });
    const expected = { name: 'Inconsciente', tone: 'incapacitating', look: 'unconscious' };
    expect(await eventPayload(biaEvents, 'condition:defined')).toMatchObject({
      definition: expected,
    });
    expect(await eventPayload(caioEvents, 'condition:defined')).toMatchObject({
      definition: expected,
    });
    const inconsciente = definitionId(await synced(master, vharn), 'Inconsciente');
    const apply = { ...envelope(vharn.id), tokenId: lyraId, conditionId: inconsciente, rounds: 0 };
    await send(master, 'condition:apply', apply);
    const applied = conditionAppliedDto.parse(await eventPayload(caioEvents, 'condition:applied'));
    expect(applied.condition).toMatchObject(expected);
    const lyra = (await synced(caioEvents.client, vharn)).tokens.find(({ id }) => id === lyraId);
    expect(lyra?.conditions).toEqual([applied.condition]);
    expect(quelmEvents.events.map(({ name }) => name)).not.toContain('condition:defined');
  });

  it('a define with a forged userId is INVALID_BODY and defines nothing', async () => {
    const master = await atTable(baseUrl, clients, ana, vharn);
    const define = { ...envelope(vharn.id), name: 'Sumido', tone: 'benefit', icon: 'ghost' };
    const refused = await send(master, 'condition:define', { ...define, userId: bia.id });
    expect(refused).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'INVALID_BODY' }),
    });
    expect((await synced(master, vharn)).conditionDefinitions).toHaveLength(11);
  });

  it('defining a name that exists answers ok without a new definition or an event', async () => {
    const master = await atTable(baseUrl, clients, ana, vharn);
    const biaEvents = recordEventsOf(await atTable(baseUrl, clients, bia, vharn));
    await send(master, 'condition:define', {
      ...envelope(vharn.id),
      name: 'envenenado',
      tone: 'harm',
      icon: 'skull',
    });
    await silence();
    expect(biaEvents.events.map(({ name }) => name)).not.toContain('condition:defined');
    expect((await synced(master, vharn)).conditionDefinitions).toHaveLength(11);
  });

  it('the master applying "Caído" to two tokens at once reaches everyone in one event', async () => {
    const master = await atTable(baseUrl, clients, ana, vharn);
    const lyraId = await lyraOfBia(master);
    const bramId = await placedToken(master, 'Bram', caio.id, 3);
    const biaEvents = recordEventsOf(await atTable(baseUrl, clients, bia, vharn));
    const caido = definitionId(await synced(master, vharn), 'Caído');
    const applyMany = { ...envelope(vharn.id), tokenIds: [lyraId, bramId], conditionId: caido };
    expect(await send(master, 'condition:applyMany', { ...applyMany, rounds: 0 })).toMatchObject({
      ok: true,
    });
    const event = conditionsAppliedDto.parse(
      await eventPayload(biaEvents, 'condition:appliedMany'),
    );
    expect(event.applied.map(({ tokenId }) => tokenId)).toEqual([lyraId, bramId]);
    const state = await synced(biaEvents.client, vharn);
    expect(state.version).toBe(event.version);
    expect(state.tokens.every(({ conditions }) => conditions[0]?.name === 'Caído')).toBe(true);
  });

  it('Bia applying to her Lyra and Caio’s Bram at once puts Cego on both in one version', async () => {
    const master = await atTable(baseUrl, clients, ana, vharn);
    const lyraId = await lyraOfBia(master);
    const bramId = await placedToken(master, 'Bram', caio.id, 3);
    const biaClient = await atTable(baseUrl, clients, bia, vharn);
    const cego = definitionId(await synced(biaClient, vharn), 'Cego');
    const applyMany = { ...envelope(vharn.id), tokenIds: [lyraId, bramId], conditionId: cego };

    const ack = await send(biaClient, 'condition:applyMany', { ...applyMany, rounds: 1 });

    const state = await synced(master, vharn);
    expect(ack).toEqual({ ok: true, version: state.version });
    expect(state.tokens.map(({ conditions }) => conditions.map(({ name }) => name))).toEqual([
      ['Cego'],
      ['Cego'],
    ]);
  });
  describe('condition:setRounds', () => {
    type Poisoned = Readonly<{
      master: RealtimeClient;
      biaClient: RealtimeClient;
      lyraId: string;
      activeId: string;
      lyraEntry: string;
    }>;

    // Lyra alone in the combat, poisoned for 3 in round 1, now in round 2.
    async function poisonedLyraInRound2(): Promise<Poisoned> {
      const master = await atTable(baseUrl, clients, ana, vharn);
      const lyraId = await lyraOfBia(master);
      const events = recordEventsOf(master);
      const entries = [{ name: null, tokenIds: [lyraId], initiative: 10 }];
      await send(master, 'combat:start', { ...envelope(vharn.id), entries });
      const combat = combatStartedDto.parse(await eventPayload(events, 'combat:started')).combat;
      const lyraEntry = combat.combatants[0]?.id ?? '';
      const biaClient = await atTable(baseUrl, clients, bia, vharn);
      const envenenado = definitionId(await synced(biaClient, vharn), 'Envenenado');
      const apply = { ...envelope(vharn.id), tokenId: lyraId, conditionId: envenenado, rounds: 3 };
      await send(biaClient, 'condition:apply', apply);
      await send(master, 'combat:nextTurn', { ...envelope(vharn.id), fromCombatantId: lyraEntry });
      const state = await synced(master, vharn);
      const activeId = state.tokens[0]?.conditions[0]?.id ?? '';
      return { master, biaClient, lyraId, activeId, lyraEntry };
    }

    function setRounds(poisoned: Poisoned, rounds: number) {
      const { lyraId, activeId } = poisoned;
      return { ...envelope(vharn.id), tokenId: lyraId, activeConditionId: activeId, rounds };
    }

    it('Bia setting 2 on her Lyra reaches Ana and Caio as condition:applied with 2 rounds', async () => {
      const poisoned = await poisonedLyraInRound2();
      const anaEvents = recordEventsOf(poisoned.master);
      const caioEvents = recordEventsOf(await atTable(baseUrl, clients, caio, vharn));

      const ack = await send(poisoned.biaClient, 'condition:setRounds', setRounds(poisoned, 2));

      expect(ack).toMatchObject({ ok: true });
      for (const events of [anaEvents, caioEvents]) {
        const applied = conditionAppliedDto.parse(await eventPayload(events, 'condition:applied'));
        expect(applied.condition).toMatchObject({ id: poisoned.activeId, remainingRounds: 2 });
      }
    });

    it('set to 2 in round 2, the end of the Lyra’s turn in round 2 counts it down to 1', async () => {
      const poisoned = await poisonedLyraInRound2();
      await send(poisoned.biaClient, 'condition:setRounds', setRounds(poisoned, 2));
      const events = recordEventsOf(poisoned.master);

      await send(poisoned.master, 'combat:nextTurn', {
        ...envelope(vharn.id),
        fromCombatantId: poisoned.lyraEntry,
      });

      const turn = combatTurnChangedDto.parse(await eventPayload(events, 'combat:turnChanged'));
      expect(turn.conditionChanges[0]?.conditions[0]?.remainingRounds).toBe(1);
    });

    it('Caio, who does not control the Lyra, setting 1 round reaches Ana as condition:applied', async () => {
      const poisoned = await poisonedLyraInRound2();
      const anaEvents = recordEventsOf(poisoned.master);
      const caioClient = await atTable(baseUrl, clients, caio, vharn);

      const ack = await send(caioClient, 'condition:setRounds', setRounds(poisoned, 1));

      expect(ack).toMatchObject({ ok: true });
      const applied = conditionAppliedDto.parse(await eventPayload(anaEvents, 'condition:applied'));
      expect(applied.condition).toMatchObject({ id: poisoned.activeId, remainingRounds: 1 });
    });

    it('a token of Quelm is TOKEN_NOT_FOUND at Vharn', async () => {
      const poisoned = await poisonedLyraInRound2();
      const quelmMaster = await atTable(baseUrl, clients, caio, quelm);
      const recorder = recordEventsOf(quelmMaster);
      await send(quelmMaster, 'token:create', {
        ...envelope(quelm.id),
        name: 'Ogro',
        initials: 'OG',
        side: 'enemy',
        width: 1,
        height: 1,
        col: 1,
        row: 1,
        controllerIds: [],
        bars: [],
      });
      const ogro = tokenCreatedDto.parse(await eventPayload(recorder, 'token:created')).token.id;

      const ack = await send(poisoned.master, 'condition:setRounds', {
        ...setRounds(poisoned, 2),
        tokenId: ogro,
      });

      expect(ack).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'TOKEN_NOT_FOUND' }),
      });
    });

    it('a forged userId is INVALID_BODY', async () => {
      const poisoned = await poisonedLyraInRound2();

      const ack = await send(poisoned.biaClient, 'condition:setRounds', {
        ...setRounds(poisoned, 2),
        userId: ana.id,
      });

      expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
    });
  });
});
