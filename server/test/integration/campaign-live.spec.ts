import {
  campaignResponseDto,
  sessionCampaignDeletedDto,
  sessionCampaignUpdatedDto,
  MAX_OPEN_TABLES,
  sessionJoinAckDto,
  type SessionJoinAckDto,
  type SessionStateDto,
} from '@lorkarium/contracts';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import {
  connectRealtime,
  recordEventsOf,
  type RealtimeClient,
  type RecordedEvent,
} from '../support/realtime-client';
import { signUpAndLogin, type SignedInUser } from '../support/sign-in';
import { createTable, joinByCode, type Table } from '../support/tables';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

// Long enough for an event already emitted to arrive on localhost; far below the 5 s grace.
const SILENCE_MS = 300;

describe('campaign changes at the live table', () => {
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
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.close();
    await app.close();
  });

  async function connect(user: SignedInUser): Promise<RealtimeClient> {
    const client = await connectRealtime(baseUrl, { token: user.token });
    clients.push(client);
    return client;
  }

  async function join(client: RealtimeClient, campaignId: string): Promise<SessionJoinAckDto> {
    const command = { actionId: crypto.randomUUID(), campaignId };
    return sessionJoinAckDto.parse(await client.timeout(2000).emitWithAck('session:join', command));
  }

  async function joined(client: RealtimeClient, campaignId: string): Promise<SessionStateDto> {
    const ack = await join(client, campaignId);
    if (!ack.ok) throw new Error(`join of ${campaignId} refused with ${ack.error.code}`);
    return ack.state;
  }

  function call(
    method: 'GET' | 'PATCH' | 'POST' | 'DELETE',
    url: string,
    user: SignedInUser,
    payload?: object,
  ): Promise<LightMyRequestResponse> {
    const cookies = { lk_session: user.token };
    return app.inject({ method, url: `/api${url}`, cookies, payload });
  }

  // The master changes the settings only with the table open (CAMPAIGN_NOT_OPEN otherwise).
  async function anaAtVharn(): Promise<void> {
    await joined(await connect(ana), vharn.id);
  }

  async function silence(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, SILENCE_MS));
  }

  function eventsNamed(events: readonly RecordedEvent[], name: string): unknown[] {
    return events.filter((event) => event.name === name).map(({ payload }) => payload);
  }

  describe('session:campaignUpdated', () => {
    it('Bia at VHARN hears the saved campaign with the version moved by one', async () => {
      await anaAtVharn();
      const biaEvents = recordEventsOf(await connect(bia));
      const { version } = await joined(biaEvents.client, vharn.id);

      await call('PATCH', `/campaigns/${vharn.id}`, ana, { name: 'Vharn', status: 'ongoing' });

      await biaEvents.until(1);
      const [event] = eventsNamed(biaEvents.events, 'session:campaignUpdated');
      expect(sessionCampaignUpdatedDto.parse(event)).toMatchObject({
        campaignId: vharn.id,
        version: version + 1,
        campaign: { id: vharn.id, name: 'Vharn', status: 'ongoing', memberCount: 2 },
      });
    });

    it('a token setting turned on reaches Bia live with the other still off', async () => {
      await anaAtVharn();
      const biaEvents = recordEventsOf(await connect(bia));
      await joined(biaEvents.client, vharn.id);

      await call('PATCH', `/campaigns/${vharn.id}`, ana, { playersCreateTokens: true });

      await biaEvents.until(1);
      const [event] = eventsNamed(biaEvents.events, 'session:campaignUpdated');
      expect(sessionCampaignUpdatedDto.parse(event).campaign).toMatchObject({
        playersCreateTokens: true,
        playersDeleteTokens: false,
      });
    });

    it('a new join code is announced too, without the code itself', async () => {
      await anaAtVharn();
      const biaEvents = recordEventsOf(await connect(bia));
      await joined(biaEvents.client, vharn.id);

      await call('POST', `/campaigns/${vharn.id}/join-code`, ana);

      await biaEvents.until(1);
      const [event] = eventsNamed(biaEvents.events, 'session:campaignUpdated');
      expect(sessionCampaignUpdatedDto.parse(event).campaignId).toBe(vharn.id);
      expect(JSON.stringify(event)).not.toContain('joinCode');
    });

    it('Caio, only at QUELM, hears nothing of a change at VHARN (criterion 14)', async () => {
      await anaAtVharn();
      const caioEvents = recordEventsOf(await connect(caio));
      await joined(caioEvents.client, quelm.id);

      await call('PATCH', `/campaigns/${vharn.id}`, ana, { name: 'Vharn' });

      await silence();
      expect(eventsNamed(caioEvents.events, 'session:campaignUpdated')).toEqual([]);
    });

    it('a refused change is never announced', async () => {
      const anaEvents = recordEventsOf(await connect(ana));
      await joined(anaEvents.client, vharn.id);

      const refused = await call('PATCH', `/campaigns/${vharn.id}`, bia, { name: 'Da Bia' });

      expect(refused.statusCode).toBe(403);
      await silence();
      expect(eventsNamed(anaEvents.events, 'session:campaignUpdated')).toEqual([]);
    });
  });

  describe('session:campaignDeleted', () => {
    it('Bia at VHARN hears the deletion and the table can no longer be joined', async () => {
      await anaAtVharn();
      const biaClient = await connect(bia);
      const biaEvents = recordEventsOf(biaClient);
      await joined(biaClient, vharn.id);

      expect((await call('DELETE', `/campaigns/${vharn.id}`, ana)).statusCode).toBe(204);

      await biaEvents.until(1);
      const [event] = eventsNamed(biaEvents.events, 'session:campaignDeleted');
      expect(sessionCampaignDeletedDto.parse(event)).toMatchObject({ campaignId: vharn.id });
      const again = await join(biaClient, vharn.id);
      expect(again.ok ? null : again.error.code).toBe('CAMPAIGN_NOT_FOUND');
    });

    it('the deleted table frees its slot on the connection', async () => {
      await anaAtVharn();
      expect(MAX_OPEN_TABLES).toBe(5);
      const biaClient = await connect(bia);
      await joined(biaClient, vharn.id);
      const own = ['Bia 1', 'Bia 2', 'Bia 3', 'Bia 4'];
      for (const name of own) await joined(biaClient, (await createTable(app, bia, name)).id);
      const sixth = await createTable(app, bia, 'Bia 5');
      expect((await join(biaClient, sixth.id)).ok).toBe(false);

      await call('DELETE', `/campaigns/${vharn.id}`, ana);

      expect((await join(biaClient, sixth.id)).ok).toBe(true);
    });

    it('Caio, only at QUELM, hears nothing of the deletion of VHARN', async () => {
      await anaAtVharn();
      const caioEvents = recordEventsOf(await connect(caio));
      await joined(caioEvents.client, quelm.id);

      await call('DELETE', `/campaigns/${vharn.id}`, ana);

      await silence();
      expect(eventsNamed(caioEvents.events, 'session:campaignDeleted')).toEqual([]);
    });
  });

  describe('online in the detail', () => {
    it('the detail marks online whoever has the table open, and only at that table', async () => {
      await joined(await connect(bia), vharn.id);
      await joined(await connect(caio), quelm.id);

      const response = await call('GET', `/campaigns/${vharn.id}`, ana);

      const { members } = campaignResponseDto.parse(response.json()).campaign;
      expect(members.map(({ userId, online }) => ({ userId, online }))).toEqual([
        { userId: ana.id, online: false },
        { userId: bia.id, online: true },
      ]);
    });

    it('nobody at the table leaves every member offline', async () => {
      const response = await call('GET', `/campaigns/${vharn.id}`, ana);
      const { members } = campaignResponseDto.parse(response.json()).campaign;
      expect(members.every(({ online }) => !online)).toBe(true);
    });
  });
});
