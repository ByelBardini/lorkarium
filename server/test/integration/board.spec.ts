import {
  boardCommandAckDto,
  boardSyncAckDto,
  sessionJoinAckDto,
  type BoardCommandAckDto,
  type BoardStateDto,
  type BoardSyncAckDto,
  type ConfigureSceneCommandDto,
} from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { MemberCardsDao } from '../../src/modules/member-cards/member-cards.dao';
import {
  connectRealtime,
  disconnectionOf,
  recordEventsOf,
  type RealtimeClient,
} from '../support/realtime-client';
import { signUpAndLogin, type SignedInUser } from '../support/sign-in';
import { sendImage } from '../support/images';
import { createTable, joinByCode, type Table } from '../support/tables';
import { envelope, send, synced as syncedOf } from '../support/live-table';
import { openTestDatabase, truncateAllTables } from '../support/test-database';
import { tokenCommandFor } from '../support/token-table';

const SILENCE_MS = 300;
const GRID_30_BY_20 = {
  widthCells: 30,
  heightCells: 20,
  cellDistance: 1.5,
  cellUnit: 'm',
  gridVisible: true,
  gridOpacity: 15,
};

describe('board over Socket.IO', () => {
  const env: Env = { ...readEnv(process.env), adminSeed: null };
  const clients: RealtimeClient[] = [];
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let baseUrl: string;
  let ana: SignedInUser;
  let bia: SignedInUser;
  let vharn: Table;

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
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.close();
    await app.close();
  });

  function command(campaignId: string): { actionId: string; campaignId: string } {
    return { actionId: crypto.randomUUID(), campaignId };
  }

  async function atTable(user: SignedInUser, table: Table): Promise<RealtimeClient> {
    const client = await connectRealtime(baseUrl, { token: user.token });
    clients.push(client);
    const ack = sessionJoinAckDto.parse(
      await client.timeout(2000).emitWithAck('session:join', command(table.id)),
    );
    if (!ack.ok) throw new Error(`join of ${table.id} refused with ${ack.error.code}`);
    return client;
  }

  async function sync(client: RealtimeClient, campaignId: string): Promise<BoardSyncAckDto> {
    return boardSyncAckDto.parse(
      await client.timeout(2000).emitWithAck('board:sync', command(campaignId)),
    );
  }

  async function synced(client: RealtimeClient, campaignId: string): Promise<BoardStateDto> {
    const ack = await sync(client, campaignId);
    if (!ack.ok) throw new Error(`sync of ${campaignId} refused with ${ack.error.code}`);
    return ack.state;
  }

  async function configure(
    client: RealtimeClient,
    payload: ConfigureSceneCommandDto,
  ): Promise<BoardCommandAckDto> {
    return boardCommandAckDto.parse(
      await client.timeout(2000).emitWithAck('scene:configure', payload),
    );
  }

  it("Bia's board:sync answers her as player with the 20×12 scene at version 0", async () => {
    const state = await synced(await atTable(bia, vharn), vharn.id);
    expect(state).toMatchObject({
      campaignId: vharn.id,
      version: 0,
      viewer: { userId: bia.id, role: 'player' },
      scene: { widthCells: 20, heightCells: 12, cellDistance: 1.5, cellUnit: 'm' },
      tokens: [],
      combat: null,
    });
  });

  it('the master configuring the grid acks version 1 and both receive scene:updated with it', async () => {
    const anaEvents = recordEventsOf(await atTable(ana, vharn));
    const biaEvents = recordEventsOf(await atTable(bia, vharn));
    const ack = await configure(anaEvents.client, { ...command(vharn.id), ...GRID_30_BY_20 });
    expect(ack).toEqual({ ok: true, version: 1 });
    for (const recorder of [anaEvents, biaEvents]) {
      await recorder.until(recorder === anaEvents ? 2 : 1);
      const updated = recorder.events.find(({ name }) => name === 'scene:updated');
      expect(updated?.payload).toMatchObject({
        campaignId: vharn.id,
        version: 1,
        scene: GRID_30_BY_20,
      });
    }
  });

  it('a player configuring the grid gets FORBIDDEN and nobody receives scene:updated', async () => {
    const anaEvents = recordEventsOf(await atTable(ana, vharn));
    const biaClient = await atTable(bia, vharn);
    const ack = await configure(biaClient, { ...command(vharn.id), ...GRID_30_BY_20 });
    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
    await new Promise((resolve) => setTimeout(resolve, SILENCE_MS));
    expect(anaEvents.events.map(({ name }) => name)).not.toContain('scene:updated');
  });

  it('a board:sync of a table not open on the connection gets CAMPAIGN_NOT_FOUND', async () => {
    const client = await connectRealtime(baseUrl, { token: ana.token });
    clients.push(client);
    const ack = await sync(client, vharn.id);
    expect(ack).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }),
    });
  });

  it('a board:sync carrying a forged userId gets INVALID_BODY naming the field', async () => {
    const client = await atTable(ana, vharn);
    const forged = { ...command(vharn.id), userId: bia.id };
    const ack = boardSyncAckDto.parse(await client.timeout(2000).emitWithAck('board:sync', forged));
    expect(ack).toEqual({
      ok: false,
      error: { code: 'INVALID_BODY', message: expect.stringContaining('userId') },
    });
  });

  it('after Bia logs out, her connection to the board drops at once', async () => {
    const client = await atTable(bia, vharn);
    const dropped = disconnectionOf(client);
    await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { lk_session: bia.token },
    });
    expect(await dropped).toBe('io server disconnect');
  });

  it('after a restart on the same database, board:sync returns the configured grid and version', async () => {
    await configure(await atTable(ana, vharn), { ...command(vharn.id), ...GRID_30_BY_20 });
    for (const client of clients.splice(0)) client.close();
    await app.close();
    await startApp();
    const state = await synced(await atTable(ana, vharn), vharn.id);
    expect(state).toMatchObject({ version: 1, scene: GRID_30_BY_20 });
  });

  // The session:join of atTable drew the first command of the same bucket.
  it('the 41st command of a burst gets RATE_LIMITED with when to retry, and another connection does not', async () => {
    const anaClient = await atTable(ana, vharn);
    const acks = await Promise.all(Array.from({ length: 40 }, () => sync(anaClient, vharn.id)));
    expect(acks.slice(0, 39).every((ack) => ack.ok)).toBe(true);
    expect(acks[39]).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'RATE_LIMITED', retryAfterSeconds: 1 }),
    });
    expect((await sync(await atTable(bia, vharn), vharn.id)).ok).toBe(true);
  });

  describe('scene background', () => {
    it('the master sets an image of the table and Bia receives scene:updated with its pixels', async () => {
      const map = await sendImage(app, ana, vharn, 1400, 700);
      const anaClient = await atTable(ana, vharn);
      const biaEvents = recordEventsOf(await atTable(bia, vharn));

      const ack = await configure(anaClient, {
        ...command(vharn.id),
        ...GRID_30_BY_20,
        backgroundAssetId: map.id,
      });

      expect(ack).toEqual({ ok: true, version: 1 });
      await biaEvents.until(1);
      const updated = biaEvents.events.find(({ name }) => name === 'scene:updated');
      expect(updated?.payload).toMatchObject({
        scene: { background: { assetId: map.id, width: 1400, height: 700 } },
      });
    });

    it('after a restart, board:sync still carries the background', async () => {
      const map = await sendImage(app, ana, vharn, 1400, 700);
      const payload = { ...command(vharn.id), ...GRID_30_BY_20, backgroundAssetId: map.id };
      await configure(await atTable(ana, vharn), payload);
      for (const client of clients.splice(0)) client.close();
      await app.close();
      await startApp();

      const state = await synced(await atTable(bia, vharn), vharn.id);

      expect(state.scene.background).toEqual({ assetId: map.id, width: 1400, height: 700 });
    });

    it('an image of another table is refused with ASSET_NOT_FOUND and nobody hears of it', async () => {
      const caio = await signUpAndLogin(app, connection.db, 'Caio');
      const quelm = await createTable(app, caio, 'Quelm');
      const quelmMap = await sendImage(app, caio, quelm, 800, 800);
      const anaClient = await atTable(ana, vharn);
      const biaEvents = recordEventsOf(await atTable(bia, vharn));

      const ack = await configure(anaClient, {
        ...command(vharn.id),
        ...GRID_30_BY_20,
        backgroundAssetId: quelmMap.id,
      });

      expect(ack).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'ASSET_NOT_FOUND' }),
      });
      await new Promise((resolve) => setTimeout(resolve, SILENCE_MS));
      expect(biaEvents.events.map(({ name }) => name)).not.toContain('scene:updated');
    });
  });

  describe('member cards in the snapshot', () => {
    let caio: SignedInUser;
    let quelm: Table;

    beforeEach(async () => {
      caio = await signUpAndLogin(app, connection.db, 'Caio');
      await joinByCode(app, caio, vharn);
      quelm = await createTable(app, caio, 'Quelm');
    });

    it('the card of Bia comes in the sync of Ana, Bia and Caio, the same for the three', async () => {
      await new MemberCardsDao(connection.db).save(vharn.id, bia.id, { armorClass: 15 });

      for (const user of [ana, bia, caio]) {
        const state = await synced(await atTable(user, vharn), vharn.id);
        expect(state.memberCards).toEqual([
          {
            userId: bia.id,
            characterName: null,
            armorClass: 15,
            difficultyClass: null,
            noteOne: null,
            noteTwo: null,
            anchorTokenId: null,
          },
        ]);
      }
    });

    it('a table without any card syncs memberCards []', async () => {
      const state = await synced(await atTable(ana, vharn), vharn.id);

      expect(state.memberCards).toEqual([]);
    });

    it('the sync of Quelm does not carry the card of Bia on Vharn', async () => {
      await new MemberCardsDao(connection.db).save(vharn.id, bia.id, { armorClass: 15 });

      const state = await synced(await atTable(caio, quelm), quelm.id);

      expect(state.memberCards).toEqual([]);
    });
  });
});

describe('the command queue of each table, with a pool of 2 connections', () => {
  const env: Env = { ...readEnv(process.env), adminSeed: null };
  const clients: RealtimeClient[] = [];
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let baseUrl: string;

  beforeAll(async () => {
    connection = await openTestDatabase({ poolMax: 2 });
  });

  afterAll(() => connection.close());

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    app = await buildApp({ env, db: connection.db });
    baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.close();
    await app.close();
  });

  async function masterAt(
    name: string,
  ): Promise<{ client: RealtimeClient; table: Table; userId: string }> {
    const user = await signUpAndLogin(app, connection.db, name);
    const table = await createTable(app, user, `Mesa de ${name}`);
    const client = await connectRealtime(baseUrl, { token: user.token });
    clients.push(client);
    await client.timeout(2000).emitWithAck('session:join', envelope(table.id));
    return { client, table, userId: user.id };
  }

  it('20 token:move at once in VHARN keep versions in sequence, and a board:sync of QUELM answers before most of them', async () => {
    const vharn = await masterAt('Ana');
    const quelm = await masterAt('Caio');
    await send(vharn.client, 'token:create', tokenCommandFor(vharn.table, vharn.userId));
    const [lyra] = (await syncedOf(vharn.client, vharn.table)).tokens;
    if (!lyra) throw new Error('Lyra was not created');
    const answered: string[] = [];
    const moves = Array.from({ length: 20 }, async (_, index) => {
      const move = { ...envelope(vharn.table.id), tokenId: lyra.id, col: index % 10, row: 1 };
      const ack = await send(vharn.client, 'token:move', move);
      answered.push('vharn');
      return ack;
    });
    const quelmSync = syncedOf(quelm.client, quelm.table).then((state) => {
      answered.push('quelm');
      return state;
    });

    const acks = await Promise.all(moves);
    expect((await quelmSync).campaignId).toBe(quelm.table.id);
    const versions = acks.map((ack) => (ack.ok ? ack.version : -1)).sort((a, b) => a - b);
    expect(versions).toEqual(Array.from({ length: 20 }, (_, index) => index + 2));
    expect(answered.indexOf('quelm')).toBeLessThan(10);
  });
});
