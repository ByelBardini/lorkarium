import {
  combatStartedDto,
  combatTurnChangedDto,
  combatUpdatedDto,
  tokenCreatedDto,
  tokenDeletedDto,
  type BoardStateDto,
  type CombatDto,
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

describe('combat over Socket.IO', () => {
  const env: Env = { ...readEnv(process.env), adminSeed: null };
  const clients: RealtimeClient[] = [];
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let baseUrl: string;
  let ana: SignedInUser;
  let bia: SignedInUser;
  let vharn: Table;
  let master: EventRecorder;
  let tokenIds: { kael: string; lyra: string; ogro: string };

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  async function startApp(): Promise<void> {
    app = await buildApp({ env, db: connection.db });
    baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
  }

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    await startApp();
    ana = await signUpAndLogin(app, connection.db, 'Ana');
    bia = await signUpAndLogin(app, connection.db, 'Bia');
    vharn = await createTable(app, ana, 'Os Sinos de Vharn');
    await joinByCode(app, bia, vharn);
    master = recordEventsOf(await atTable(baseUrl, clients, ana, vharn));
    tokenIds = {
      kael: await tokenOf('Kael', [bia.id]),
      lyra: await tokenOf('Lyra', []),
      ogro: await tokenOf('Ogro', []),
    };
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.close();
    await app.close();
  });

  async function tokenOf(name: string, controllerIds: string[]): Promise<string> {
    const before = master.events.length;
    await send(master.client, 'token:create', {
      ...envelope(vharn.id),
      name,
      initials: name.slice(0, 2).toUpperCase(),
      side: 'ally',
      size: 1,
      col: 1,
      row: 1,
      controllerIds,
      bars: [],
    });
    const recorder = { ...master, events: master.events.slice(before) };
    return tokenCreatedDto.parse(await eventPayload(recorder, 'token:created')).token.id;
  }

  async function startCombat(): Promise<CombatDto> {
    const ids = [tokenIds.kael, tokenIds.lyra, tokenIds.ogro];
    await send(master.client, 'combat:start', { ...envelope(vharn.id), tokenIds: ids });
    return combatStartedDto.parse(await eventPayload(master, 'combat:started')).combat;
  }

  function combatantOf(combat: CombatDto, tokenId: string): string {
    const found = combat.combatants.find((c) => c.tokenId === tokenId);
    if (!found) throw new Error(`no combatant for ${tokenId}`);
    return found.id;
  }

  async function lastCombat(client: RealtimeClient): Promise<NonNullable<BoardStateDto['combat']>> {
    const state = await synced(client, vharn);
    if (!state.combat) throw new Error('no combat in the snapshot');
    return state.combat;
  }

  it('the master starts with three tokens and everyone receives combat:started', async () => {
    const biaEvents = recordEventsOf(await atTable(baseUrl, clients, bia, vharn));
    const combat = await startCombat();
    expect(combat).toMatchObject({ round: 1 });
    expect(combat.combatants).toHaveLength(3);
    expect(await eventPayload(biaEvents, 'combat:started')).toMatchObject({
      combat: { id: combat.id },
    });
  });

  it('initiatives 14, 18 and −2 reorder the tracker in combat:updated', async () => {
    const combat = await startCombat();
    const set = (tokenId: string, initiative: number) =>
      send(master.client, 'combat:setInitiative', {
        ...envelope(vharn.id),
        combatantId: combatantOf(combat, tokenId),
        initiative,
      });
    await set(tokenIds.kael, 14);
    await set(tokenIds.lyra, 18);
    await set(tokenIds.ogro, -2);
    const ordered = (await lastCombat(master.client)).combatants.map(({ tokenId }) => tokenId);
    expect(ordered).toEqual([tokenIds.lyra, tokenIds.kael, tokenIds.ogro]);
    expect(combatUpdatedDto.safeParse(await eventPayload(master, 'combat:updated')).success).toBe(
      true,
    );
  });

  it('"next" on the last combatant becomes round 2, and the Ogro’s "Envenenado 1" expires in the same event', async () => {
    const combat = await startCombat();
    const envenenado = (await synced(master.client, vharn)).conditionDefinitions.find(
      (d) => d.name === 'Envenenado',
    );
    await send(master.client, 'condition:apply', {
      ...envelope(vharn.id),
      tokenId: tokenIds.ogro,
      conditionId: envenenado?.id,
      rounds: 1,
    });
    const next = (from: string) =>
      send(master.client, 'combat:nextTurn', { ...envelope(vharn.id), fromCombatantId: from });
    await next(combatantOf(combat, tokenIds.kael));
    await next(combatantOf(combat, tokenIds.lyra));
    const before = master.events.length;
    const ack = await next(combatantOf(combat, tokenIds.ogro));
    const turn = combatTurnChangedDto.parse(
      await eventPayload({ ...master, events: master.events.slice(before) }, 'combat:turnChanged'),
    );
    expect(turn).toMatchObject({
      combat: { round: 2 },
      conditionChanges: [{ tokenId: tokenIds.ogro, conditions: [] }],
    });
    expect(ack).toEqual({ ok: true, version: turn.version });
  });

  it('Bia passes the turn of her Kael', async () => {
    const combat = await startCombat();
    const biaClient = await atTable(baseUrl, clients, bia, vharn);
    const ack = await send(biaClient, 'combat:nextTurn', {
      ...envelope(vharn.id),
      fromCombatantId: combatantOf(combat, tokenIds.kael),
    });
    expect(ack).toMatchObject({ ok: true });
    expect((await lastCombat(biaClient)).currentCombatantId).toBe(
      combatantOf(combat, tokenIds.lyra),
    );
  });

  it('the master and Bia moving the same turn at once: one passes, the other gets TURN_ALREADY_CHANGED', async () => {
    const combat = await startCombat();
    const biaClient = await atTable(baseUrl, clients, bia, vharn);
    const from = combatantOf(combat, tokenIds.kael);
    const acks = await Promise.all([
      send(master.client, 'combat:nextTurn', { ...envelope(vharn.id), fromCombatantId: from }),
      send(biaClient, 'combat:nextTurn', { ...envelope(vharn.id), fromCombatantId: from }),
    ]);
    expect(acks.filter((ack) => ack.ok)).toHaveLength(1);
    expect(acks.find((ack) => !ack.ok)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'TURN_ALREADY_CHANGED' }),
    });
    expect((await lastCombat(master.client)).currentCombatantId).toBe(
      combatantOf(combat, tokenIds.lyra),
    );
  });

  it('deleting the token on turn hands the turn on, inside token:deleted', async () => {
    const combat = await startCombat();
    await send(master.client, 'token:delete', { ...envelope(vharn.id), tokenId: tokenIds.kael });
    const deleted = tokenDeletedDto.parse(await eventPayload(master, 'token:deleted'));
    expect(deleted.combat?.currentCombatantId).toBe(combatantOf(combat, tokenIds.lyra));
    expect(deleted.combat?.combatants).toHaveLength(2);
  });

  it('ending the combat keeps the conditions on the tokens', async () => {
    await startCombat();
    const caido = (await synced(master.client, vharn)).conditionDefinitions.find(
      (d) => d.name === 'Caído',
    );
    await send(master.client, 'condition:apply', {
      ...envelope(vharn.id),
      tokenId: tokenIds.ogro,
      conditionId: caido?.id,
      rounds: 0,
    });
    expect(await send(master.client, 'combat:end', envelope(vharn.id))).toMatchObject({ ok: true });
    const state = await synced(master.client, vharn);
    expect(state.combat).toBeNull();
    expect(state.tokens.find(({ id }) => id === tokenIds.ogro)?.conditions).toHaveLength(1);
  });

  it('a player starting a combat is FORBIDDEN', async () => {
    const biaClient = await atTable(baseUrl, clients, bia, vharn);
    const ack = await send(biaClient, 'combat:start', {
      ...envelope(vharn.id),
      tokenIds: [tokenIds.kael],
    });
    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
  });

  it('after a restart the round, the turn and the order are kept', async () => {
    const combat = await startCombat();
    await send(master.client, 'combat:nextTurn', {
      ...envelope(vharn.id),
      fromCombatantId: combatantOf(combat, tokenIds.kael),
    });
    for (const client of clients.splice(0)) client.close();
    await app.close();
    await startApp();
    const after = await lastCombat(await atTable(baseUrl, clients, ana, vharn));
    expect(after).toMatchObject({
      round: 1,
      currentCombatantId: combatantOf(combat, tokenIds.lyra),
    });
    expect(after.combatants.map(({ id }) => id)).toEqual(combat.combatants.map(({ id }) => id));
  });
});
