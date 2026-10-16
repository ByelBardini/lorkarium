import { conditionAppliedDto, tokenCreatedDto, type BoardStateDto } from '@lorkarium/contracts';
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
    const recorder = recordEventsOf(master);
    await send(master, 'token:create', {
      ...envelope(vharn.id),
      name: 'Lyra',
      initials: 'LY',
      side: 'ally',
      size: 1,
      col: 1,
      row: 1,
      controllerIds: [bia.id],
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

  it('Caio applying to Bia’s token is FORBIDDEN', async () => {
    const master = await atTable(baseUrl, clients, ana, vharn);
    const lyraId = await lyraOfBia(master);
    const caioClient = await atTable(baseUrl, clients, caio, vharn);
    const cego = definitionId(await synced(caioClient, vharn), 'Cego');
    const apply = { ...envelope(vharn.id), tokenId: lyraId, conditionId: cego, rounds: 1 };
    expect(await send(caioClient, 'condition:apply', apply)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'FORBIDDEN' }),
    });
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
      }),
    ).toMatchObject({
      ok: true,
    });
    expect(await eventPayload(biaEvents, 'condition:defined')).toMatchObject({
      definition: { name: 'Sangrando', tone: 'harm' },
    });
    const refused = await send(biaEvents.client, 'condition:define', {
      ...envelope(vharn.id),
      name: 'Furtivo',
      tone: 'benefit',
    });
    expect(refused).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
  });

  it('defining a name that exists answers ok without a new definition or an event', async () => {
    const master = await atTable(baseUrl, clients, ana, vharn);
    const biaEvents = recordEventsOf(await atTable(baseUrl, clients, bia, vharn));
    await send(master, 'condition:define', {
      ...envelope(vharn.id),
      name: 'envenenado',
      tone: 'harm',
    });
    await silence();
    expect(biaEvents.events.map(({ name }) => name)).not.toContain('condition:defined');
    expect((await synced(master, vharn)).conditionDefinitions).toHaveLength(11);
  });
});
