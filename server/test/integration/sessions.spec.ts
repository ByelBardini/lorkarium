import {
  sessionActivityAckDto,
  sessionJoinAckDto,
  sessionMemberActivityDto,
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
import { createTable, joinByCode, type Table } from '../support/tables';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

// Long enough for an event already emitted to arrive on localhost; far below the 5 s grace.
const SILENCE_MS = 300;

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
      { userId: ana.id, name: 'Ana', role: 'master', online: true, awaySince: null },
      { userId: bia.id, name: 'Bia', role: 'player', online: false, awaySince: null },
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
          member: { userId: bia.id, name: 'Bia', role: 'player', online: true, awaySince: null },
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

  describe('several tables on one connection', () => {
    async function leave(client: RealtimeClient, campaignId: string): Promise<unknown> {
      return client.timeout(2000).emitWithAck('session:leave', command(campaignId));
    }

    async function createTablesOf(master: SignedInUser, count: number): Promise<string[]> {
      const names = Array.from({ length: count }, (_, index) => `Mesa ${index + 2}`);
      const tables = await Promise.all(names.map((name) => createTable(app, master, name)));
      return tables.map(({ id }) => id);
    }

    it('Ana joining VHARN and then QUELM keeps her in VHARN and announces her in QUELM', async () => {
      await joinByCode(app, ana, quelm);
      const biaEvents = recordEventsOf(await connect(bia));
      await joined(biaEvents.client, vharn.id);
      const caioEvents = recordEventsOf(await connect(caio));
      await joined(caioEvents.client, quelm.id);
      const anaClient = await connect(ana);
      expect((await join(anaClient, vharn.id)).ok).toBe(true);
      expect((await join(anaClient, quelm.id)).ok).toBe(true);
      await caioEvents.until(1);
      await silence();
      expect(namesOf(biaEvents.events)).toEqual(['session:memberJoined']);
      expect(caioEvents.events).toEqual([
        {
          name: 'session:memberJoined',
          payload: expect.objectContaining({
            campaignId: quelm.id,
            member: expect.objectContaining({ userId: ana.id }) as unknown,
          }) as unknown,
        },
      ]);
    });

    it('the connection of Ana in both tables receives the events of each with its campaignId', async () => {
      await joinByCode(app, ana, quelm);
      const anaEvents = recordEventsOf(await connect(ana));
      await joined(anaEvents.client, vharn.id);
      await joined(anaEvents.client, quelm.id);
      await joined(await connect(bia), vharn.id);
      await joined(await connect(caio), quelm.id);
      await anaEvents.until(2);
      expect(anaEvents.events).toEqual([
        {
          name: 'session:memberJoined',
          payload: expect.objectContaining({ campaignId: vharn.id }) as unknown,
        },
        {
          name: 'session:memberJoined',
          payload: expect.objectContaining({ campaignId: quelm.id }) as unknown,
        },
      ]);
    });

    it('Caio, only in QUELM, receives nothing when Bia enters VHARN while Ana is in both', async () => {
      await joinByCode(app, ana, quelm);
      const anaEvents = recordEventsOf(await connect(ana));
      await joined(anaEvents.client, vharn.id);
      await joined(anaEvents.client, quelm.id);
      const caioEvents = recordEventsOf(await connect(caio));
      await joined(caioEvents.client, quelm.id);
      await joined(await connect(bia), vharn.id);
      await anaEvents.until(2);
      await silence();
      expect(caioEvents.events).toEqual([]);
    });

    it('Ana leaving VHARN makes Bia receive memberLeft at once, Caio nothing, and QUELM still reaches Ana', async () => {
      await joinByCode(app, ana, quelm);
      const biaEvents = recordEventsOf(await connect(bia));
      await joined(biaEvents.client, vharn.id);
      const caioEvents = recordEventsOf(await connect(caio));
      await joined(caioEvents.client, quelm.id);
      const anaEvents = recordEventsOf(await connect(ana));
      await joined(anaEvents.client, vharn.id);
      await joined(anaEvents.client, quelm.id);
      expect(await leave(anaEvents.client, vharn.id)).toEqual({ ok: true });
      await biaEvents.until(2);
      expect(biaEvents.events[1]).toMatchObject({
        name: 'session:memberLeft',
        payload: { campaignId: vharn.id, userId: ana.id },
      });
      await leave(caioEvents.client, quelm.id);
      await anaEvents.until(1);
      expect(anaEvents.events).toEqual([
        {
          name: 'session:memberLeft',
          payload: expect.objectContaining({ campaignId: quelm.id, userId: caio.id }) as unknown,
        },
      ]);
      expect(namesOf(caioEvents.events)).toEqual(['session:memberJoined']);
    });

    it('Ana is refused the 6th table with TOO_MANY_TABLES, may re-join an open one, and gets the 6th after leaving one', async () => {
      const [fifth, sixth, ...others] = [vharn.id, ...(await createTablesOf(ana, 5))].reverse();
      if (!fifth || !sixth) throw new Error(`expected 6 tables, got ${others.length + 2}`);
      const anaClient = await connect(ana);
      for (const id of [...others, fifth]) await joined(anaClient, id);
      expect(await join(anaClient, sixth)).toEqual({
        ok: false,
        error: { code: 'TOO_MANY_TABLES', message: 'Too many open tables' },
      });
      expect((await join(anaClient, fifth)).ok).toBe(true);
      await leave(anaClient, fifth);
      expect((await join(anaClient, sixth)).ok).toBe(true);
    });

    // Ten, not six: with six the joins rarely overlap enough to expose a check made after the await.
    it('ten joins emitted without waiting for the acks admit exactly five and refuse five with TOO_MANY_TABLES', async () => {
      const ids = [vharn.id, ...(await createTablesOf(ana, 9))];
      const anaClient = await connect(ana);
      const acks = await Promise.all(ids.map((id) => join(anaClient, id)));
      const refused = acks.filter((ack) => !ack.ok);
      expect(refused).toHaveLength(5);
      expect(refused[0]).toEqual({
        ok: false,
        error: { code: 'TOO_MANY_TABLES', message: 'Too many open tables' },
      });
    });

    it('a refused join of a table Ana is not a member of does not take one of her slots', async () => {
      const [fifth, ...four] = [vharn.id, ...(await createTablesOf(ana, 4))];
      if (!fifth) throw new Error(`expected 5 tables, got ${four.length}`);
      const anaClient = await connect(ana);
      for (const id of four) await joined(anaClient, id);
      expect(await join(anaClient, quelm.id)).toMatchObject({
        ok: false,
        error: { code: 'CAMPAIGN_NOT_FOUND' },
      });
      expect((await join(anaClient, fifth)).ok).toBe(true);
    });

    it('the connection of Ana in VHARN and QUELM dropping makes neither Bia nor Caio receive memberLeft', async () => {
      await joinByCode(app, ana, quelm);
      const biaEvents = recordEventsOf(await connect(bia));
      await joined(biaEvents.client, vharn.id);
      const caioEvents = recordEventsOf(await connect(caio));
      await joined(caioEvents.client, quelm.id);
      const anaClient = await connect(ana);
      await joined(anaClient, vharn.id);
      await joined(anaClient, quelm.id);
      await caioEvents.until(1);
      anaClient.close();
      await silence();
      expect(namesOf(biaEvents.events)).toEqual(['session:memberJoined']);
      expect(namesOf(caioEvents.events)).toEqual(['session:memberJoined']);
    });
  });

  describe('activity', () => {
    async function setActivity(
      client: RealtimeClient,
      campaignId: string,
      away: boolean,
      extra: object = {},
    ): Promise<unknown> {
      const payload = { ...command(campaignId), away, ...extra };
      return client.timeout(2000).emitWithAck('session:setActivity', payload as never);
    }

    function activitiesOf(events: readonly RecordedEvent[]) {
      return events
        .filter(({ name }) => name === 'session:memberActivity')
        .map(({ payload }) => sessionMemberActivityDto.parse(payload));
    }

    it('Bia going away reaches Ana as memberActivity, and the snapshot of who enters later carries it', async () => {
      const anaClient = await connect(ana);
      await joined(anaClient, vharn.id);
      const anaEvents = recordEventsOf(anaClient);
      const biaClient = await connect(bia);
      await joined(biaClient, vharn.id);

      expect(sessionActivityAckDto.parse(await setActivity(biaClient, vharn.id, true))).toEqual({
        ok: true,
      });

      await anaEvents.until(2);
      const [went] = activitiesOf(anaEvents.events);
      expect(went).toMatchObject({ campaignId: vharn.id, userId: bia.id, version: 3 });
      expect(went?.awaySince).toEqual(expect.any(String));
      const state = await joined(await connect(ana), vharn.id);
      expect(state.members.find(({ userId }) => userId === bia.id)?.awaySince).toBe(
        went?.awaySince,
      );
    });

    it('Bia with two tabs: one standing still says nothing, both standing still announce it', async () => {
      const anaClient = await connect(ana);
      await joined(anaClient, vharn.id);
      const [firstTab, secondTab] = [await connect(bia), await connect(bia)];
      await joined(firstTab, vharn.id);
      await joined(secondTab, vharn.id);
      const anaEvents = recordEventsOf(anaClient);

      await setActivity(firstTab, vharn.id, true);
      await silence();
      expect(activitiesOf(anaEvents.events)).toEqual([]);

      await setActivity(secondTab, vharn.id, true);
      await anaEvents.until(1);
      expect(activitiesOf(anaEvents.events)).toHaveLength(1);
    });

    it('Bia moving again reaches Ana with awaySince null', async () => {
      const anaClient = await connect(ana);
      await joined(anaClient, vharn.id);
      const biaClient = await connect(bia);
      await joined(biaClient, vharn.id);
      await setActivity(biaClient, vharn.id, true);
      const anaEvents = recordEventsOf(anaClient);

      await setActivity(biaClient, vharn.id, false);

      await anaEvents.until(1);
      expect(activitiesOf(anaEvents.events)).toEqual([
        expect.objectContaining({ userId: bia.id, awaySince: null }),
      ]);
    });

    it('a setActivity carrying a forged userId is refused with INVALID_BODY', async () => {
      const biaClient = await connect(bia);
      await joined(biaClient, vharn.id);

      const ack = await setActivity(biaClient, vharn.id, true, { userId: ana.id });

      expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID_BODY' }) });
    });

    it('a setActivity of a table not open on the connection acks ok and no room hears of it', async () => {
      const caioClient = await connect(caio);
      await joined(caioClient, quelm.id);
      const caioEvents = recordEventsOf(caioClient);
      const biaClient = await connect(bia);
      await joined(biaClient, vharn.id);

      const ack = await setActivity(biaClient, quelm.id, true);

      expect(ack).toEqual({ ok: true });
      await silence();
      expect(activitiesOf(caioEvents.events)).toEqual([]);
    });
  });
});
