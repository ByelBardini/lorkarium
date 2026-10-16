import { tokenCreatedDto, type TokenDto } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import {
  recordEventsOf,
  type EventRecorder,
  type RealtimeClient,
} from '../support/realtime-client';
import {
  atTable as joinTable,
  envelope,
  eventPayload,
  send,
  silence,
  synced,
} from '../support/live-table';
import { signUpAndLogin, type SignedInUser } from '../support/sign-in';
import { createTable, joinByCode, type Table } from '../support/tables';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

describe('tokens over Socket.IO', () => {
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

  async function startApp(): Promise<void> {
    app = await buildApp({ env, db: connection.db });
    baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
  }

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    await startApp();
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

  function lyraFor(table: Table, controllerId: string): object {
    return {
      ...envelope(table.id),
      name: 'Lyra',
      initials: 'LY',
      side: 'ally',
      size: 1,
      col: 3,
      row: 4,
      controllerIds: [controllerId],
      bars: [
        { label: 'PV', current: 32, max: 45, color: 'ember', visibility: 'controllers' },
        { label: 'Inspiração', current: 1, max: 1, color: 'gold', visibility: 'everyone' },
      ],
    };
  }

  async function createdTokenOf(recorder: EventRecorder): Promise<TokenDto> {
    return tokenCreatedDto.parse(await eventPayload(recorder, 'token:created')).token;
  }

  async function waitFor(recorder: EventRecorder, name: string): Promise<void> {
    await eventPayload(recorder, name);
  }

  function atTable(user: SignedInUser, table: Table): Promise<RealtimeClient> {
    return joinTable(baseUrl, clients, user, table);
  }

  it('Bia receives Lyra with both bars, and Caio only the visible Inspiração at position 1', async () => {
    const master = await atTable(ana, vharn);
    const biaEvents = recordEventsOf(await atTable(bia, vharn));
    const caioEvents = recordEventsOf(await atTable(caio, vharn));
    expect(await send(master, 'token:create', lyraFor(vharn, bia.id))).toEqual({
      ok: true,
      version: 1,
    });
    const forBia = await createdTokenOf(biaEvents);
    const forCaio = await createdTokenOf(caioEvents);
    expect(forBia).toMatchObject({ canControl: true });
    expect(forBia.bars.map(({ label }) => label)).toEqual(['PV', 'Inspiração']);
    expect(forCaio).toMatchObject({ canControl: false });
    expect(forCaio.bars.map(({ label, position }) => [label, position])).toEqual([
      ['Inspiração', 1],
    ]);
  });

  it('Bia moving Lyra reaches the three of them as token:moved one version later', async () => {
    const master = recordEventsOf(await atTable(ana, vharn));
    const biaClient = await atTable(bia, vharn);
    const caioEvents = recordEventsOf(await atTable(caio, vharn));
    await send(master.client, 'token:create', lyraFor(vharn, bia.id));
    const lyra = await createdTokenOf(caioEvents);
    const ack = await send(biaClient, 'token:move', {
      ...envelope(vharn.id),
      tokenId: lyra.id,
      col: 8,
      row: 6,
    });
    expect(ack).toEqual({ ok: true, version: 2 });
    for (const recorder of [master, caioEvents]) {
      await waitFor(recorder, 'token:moved');
      expect(recorder.events.find(({ name }) => name === 'token:moved')?.payload).toMatchObject({
        version: 2,
        tokenId: lyra.id,
        col: 8,
        row: 6,
      });
    }
  });

  it('the board:sync of Caio comes redacted and the one of the master whole', async () => {
    const master = await atTable(ana, vharn);
    await send(master, 'token:create', lyraFor(vharn, bia.id));
    const forCaio = (await synced(await atTable(caio, vharn), vharn)).tokens[0];
    const forAna = (await synced(master, vharn)).tokens[0];
    expect(forCaio?.bars.map(({ label }) => label)).toEqual(['Inspiração']);
    expect(forAna?.bars.map(({ label }) => label)).toEqual(['PV', 'Inspiração']);
  });

  it('Caio moving Lyra of Bia is FORBIDDEN and nobody hears a move', async () => {
    const master = recordEventsOf(await atTable(ana, vharn));
    const caioClient = await atTable(caio, vharn);
    await send(master.client, 'token:create', lyraFor(vharn, bia.id));
    const lyra = await createdTokenOf(master);
    const ack = await send(caioClient, 'token:move', {
      ...envelope(vharn.id),
      tokenId: lyra.id,
      col: 1,
      row: 1,
    });
    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    await silence();
    expect(master.events.map(({ name }) => name)).not.toContain('token:moved');
  });

  it('Bia moving Lyra outside the scene is OUT_OF_SCENE', async () => {
    const master = recordEventsOf(await atTable(ana, vharn));
    const biaClient = await atTable(bia, vharn);
    await send(master.client, 'token:create', lyraFor(vharn, bia.id));
    const lyra = await createdTokenOf(master);
    const ack = await send(biaClient, 'token:move', {
      ...envelope(vharn.id),
      tokenId: lyra.id,
      col: 20,
      row: 0,
    });
    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'OUT_OF_SCENE' }) });
  });

  it('a token of another table is TOKEN_NOT_FOUND here, even with its id in hand', async () => {
    const quelmMaster = recordEventsOf(await atTable(caio, quelm));
    await send(quelmMaster.client, 'token:create', { ...lyraFor(quelm, caio.id) });
    const quelmToken = await createdTokenOf(quelmMaster);
    const master = await atTable(ana, vharn);
    const ack = await send(master, 'token:move', {
      ...envelope(vharn.id),
      tokenId: quelmToken.id,
      col: 1,
      row: 1,
    });
    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'TOKEN_NOT_FOUND' }) });
  });

  it('a command on a table the connection never joined is CAMPAIGN_NOT_FOUND', async () => {
    const biaClient = await atTable(bia, vharn);
    const ack = await send(biaClient, 'token:create', lyraFor(quelm, bia.id));
    expect(ack).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }),
    });
  });

  it('a create carrying a forged userId is INVALID_BODY', async () => {
    const master = await atTable(ana, vharn);
    const ack = await send(master, 'token:create', { ...lyraFor(vharn, bia.id), userId: ana.id });
    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
  });

  it('after a restart the positions, the bars and the version are kept', async () => {
    const master = recordEventsOf(await atTable(ana, vharn));
    await send(master.client, 'token:create', lyraFor(vharn, bia.id));
    const lyra = await createdTokenOf(master);
    await send(master.client, 'token:move', {
      ...envelope(vharn.id),
      tokenId: lyra.id,
      col: 5,
      row: 5,
    });
    for (const client of clients.splice(0)) client.close();
    await app.close();
    await startApp();
    const state = await synced(await atTable(ana, vharn), vharn);
    expect(state.version).toBe(2);
    expect(state.tokens[0]).toMatchObject({ col: 5, row: 5 });
    expect(state.tokens[0]?.bars).toHaveLength(2);
  });
});
