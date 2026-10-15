import {
  campaignResponseDto,
  sessionJoinAckDto,
  type SessionCommandDto,
  type SessionJoinAckDto,
  type SessionStateDto,
} from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import {
  connectRealtime,
  disconnectionOf,
  recordEventsOf,
  type RealtimeClient,
  type RecordedEvent,
} from '../support/realtime-client';
import { signUpAndLogin, type SignedInUser } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

// Long enough for an event already emitted to arrive on localhost; far below the 5 s grace.
const SILENCE_MS = 300;

type Table = Readonly<{ id: string; joinCode: string }>;

describe('live table session over Socket.IO', () => {
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
    vharn = await createTable(ana, 'Os Sinos de Vharn');
    quelm = await createTable(caio, 'Quelm');
    await joinByCode(bia, vharn);
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.close();
    await app.close();
  });

  async function createTable(master: SignedInUser, name: string): Promise<Table> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      cookies: { lk_session: master.token },
      payload: { name },
    });
    const { id, joinCode } = campaignResponseDto.parse(response.json()).campaign;
    if (!joinCode) throw new Error(`campaign ${id} came back without a join code`);
    return { id, joinCode };
  }

  async function joinByCode(user: SignedInUser, table: Table): Promise<void> {
    await app.inject({
      method: 'POST',
      url: '/api/campaigns/join',
      cookies: { lk_session: user.token },
      payload: { code: table.joinCode },
    });
  }

  async function connect(user: SignedInUser): Promise<RealtimeClient> {
    const client = await connectRealtime(baseUrl, { token: user.token });
    clients.push(client);
    return client;
  }

  function command(campaignId: string): SessionCommandDto {
    return { actionId: crypto.randomUUID(), campaignId };
  }

  async function join(client: RealtimeClient, campaignId: string): Promise<SessionJoinAckDto> {
    const ack = await client.timeout(2000).emitWithAck('session:join', command(campaignId));
    return sessionJoinAckDto.parse(ack);
  }

  async function joined(client: RealtimeClient, campaignId: string): Promise<SessionStateDto> {
    const ack = await join(client, campaignId);
    if (!ack.ok) throw new Error(`join of ${campaignId} refused with ${ack.error.code}`);
    return ack.state;
  }

  async function silence(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, SILENCE_MS));
  }

  function namesOf(events: readonly RecordedEvent[]): string[] {
    return events.map(({ name }) => name);
  }

  it('Ana, master of VHARN, joining gets the snapshot with herself online, Bia offline and version 1', async () => {
    const state = await joined(await connect(ana), vharn.id);
    expect(state).toMatchObject({ campaignId: vharn.id, version: 1 });
    expect(state.members).toEqual([
      { userId: ana.id, name: 'Ana', role: 'master', online: true },
      { userId: bia.id, name: 'Bia', role: 'player', online: false },
    ]);
  });

  it('Bia joining after Ana makes Ana receive memberJoined with Bia online and version 2', async () => {
    const anaEvents = recordEventsOf(await connect(ana));
    await joined(anaEvents.client, vharn.id);
    await joined(await connect(bia), vharn.id);
    await anaEvents.until(1);
    expect(anaEvents.events).toEqual([
      {
        name: 'session:memberJoined',
        payload: {
          campaignId: vharn.id,
          version: 2,
          member: { userId: bia.id, name: 'Bia', role: 'player', online: true },
          at: expect.any(String),
        },
      },
    ]);
  });

  it('Caio, at the QUELM table, receives nothing when Bia enters VHARN', async () => {
    const caioEvents = recordEventsOf(await connect(caio));
    await joined(caioEvents.client, quelm.id);
    const anaEvents = recordEventsOf(await connect(ana));
    await joined(anaEvents.client, vharn.id);
    await joined(await connect(bia), vharn.id);
    await anaEvents.until(1);
    await silence();
    expect(caioEvents.events).toEqual([]);
  });

  it('Caio asking to join VHARN is refused with CAMPAIGN_NOT_FOUND and then hears nothing of it', async () => {
    const caioEvents = recordEventsOf(await connect(caio));
    const ack = await join(caioEvents.client, vharn.id);
    expect(ack).toEqual({
      ok: false,
      error: { code: 'CAMPAIGN_NOT_FOUND', message: 'Campaign not found' },
    });
    await joined(await connect(ana), vharn.id);
    await silence();
    expect(caioEvents.events).toEqual([]);
  });

  it('a join carrying a forged userId is refused with INVALID_BODY naming the field', async () => {
    const client = await connect(caio);
    const forged = { ...command(vharn.id), userId: ana.id } as SessionCommandDto;
    const ack = sessionJoinAckDto.parse(
      await client.timeout(2000).emitWithAck('session:join', forged),
    );
    expect(ack).toEqual({
      ok: false,
      error: { code: 'INVALID_BODY', message: expect.stringContaining('userId') },
    });
  });

  it('Bia leaving makes Ana receive memberLeft with Bia id at once', async () => {
    const anaEvents = recordEventsOf(await connect(ana));
    await joined(anaEvents.client, vharn.id);
    const biaClient = await connect(bia);
    await joined(biaClient, vharn.id);
    const leaveAck = await biaClient.timeout(2000).emitWithAck('session:leave', command(vharn.id));
    expect(leaveAck).toEqual({ ok: true });
    await anaEvents.until(2);
    expect(anaEvents.events[1]).toEqual({
      name: 'session:memberLeft',
      payload: { campaignId: vharn.id, version: 3, userId: bia.id, at: expect.any(String) },
    });
  });

  it('Bia connection dropping does not make Ana receive memberLeft within the grace period', async () => {
    const anaEvents = recordEventsOf(await connect(ana));
    await joined(anaEvents.client, vharn.id);
    const biaClient = await connect(bia);
    await joined(biaClient, vharn.id);
    await anaEvents.until(1);
    biaClient.close();
    await silence();
    expect(namesOf(anaEvents.events)).toEqual(['session:memberJoined']);
  });

  it('Bia leaving from one of two tabs does not make Ana receive memberLeft', async () => {
    const anaEvents = recordEventsOf(await connect(ana));
    await joined(anaEvents.client, vharn.id);
    const [firstTab, secondTab] = [await connect(bia), await connect(bia)];
    await joined(firstTab, vharn.id);
    await joined(secondTab, vharn.id);
    await firstTab.timeout(2000).emitWithAck('session:leave', command(vharn.id));
    await silence();
    expect(namesOf(anaEvents.events)).toEqual(['session:memberJoined']);
  });

  it('after Bia logs out over HTTP her next join is refused with UNAUTHENTICATED and the connection drops', async () => {
    const biaClient = await connect(bia);
    const dropped = disconnectionOf(biaClient);
    await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { lk_session: bia.token },
    });
    expect(await join(biaClient, vharn.id)).toEqual({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'A valid session is required' },
    });
    expect(await dropped).toBe('io server disconnect');
  });

  it('Ana joining QUELM on the connection she used for VHARN makes Bia in VHARN receive memberLeft', async () => {
    await joinByCode(ana, quelm);
    const biaEvents = recordEventsOf(await connect(bia));
    await joined(biaEvents.client, vharn.id);
    const anaClient = await connect(ana);
    await joined(anaClient, vharn.id);
    await joined(anaClient, quelm.id);
    await biaEvents.until(2);
    expect(biaEvents.events[1]).toMatchObject({
      name: 'session:memberLeft',
      payload: { campaignId: vharn.id, userId: ana.id },
    });
  });
});
