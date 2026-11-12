import {
  PLAN_LIMITS,
  campaignResponseDto,
  sessionJoinAckDto,
  type CampaignDetailDto,
  type SessionStateDto,
} from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { users } from '../../src/modules/auth/users.po';
import { connectRealtime, type RealtimeClient } from '../support/realtime-client';
import { signUpAndLogin, type SignedInUser } from '../support/sign-in';
import { createTable, joinByCode, type Table } from '../support/tables';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

describe('the plan at the table: the seals of the roster and the limits of the owner', () => {
  const env: Env = { ...readEnv(process.env), adminSeed: null };
  const clients: RealtimeClient[] = [];
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let baseUrl: string;
  let bia: SignedInUser;
  let caio: SignedInUser;
  let root: SignedInUser;
  let tavern: Table;
  let quelm: Table;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    app = await buildApp({ env, db: connection.db });
    baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
    bia = await signUpAndLogin(app, connection.db, 'Bia');
    caio = await signUpAndLogin(app, connection.db, 'Caio');
    root = await signUpAndLogin(app, connection.db, 'Root');
    // Bia is free (born so); Caio is a Lenda; Root a global admin on a stored free plan.
    await connection.db.update(users).set({ plan: 'lenda' }).where(eq(users.id, caio.id));
    await connection.db.update(users).set({ role: 'admin' }).where(eq(users.id, root.id));
    tavern = await createTable(app, bia, 'A Taverna de Bia');
    quelm = await createTable(app, root, 'Quelm');
    await joinByCode(app, caio, tavern);
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.close();
    await app.close();
  });

  async function joined(user: SignedInUser, campaignId: string): Promise<SessionStateDto> {
    const client = await connectRealtime(baseUrl, { token: user.token });
    clients.push(client);
    const command = { actionId: crypto.randomUUID(), campaignId };
    const ack = sessionJoinAckDto.parse(
      await client.timeout(2000).emitWithAck('session:join', command),
    );
    if (!ack.ok) throw new Error(`join of ${campaignId} refused with ${ack.error.code}`);
    return ack.state;
  }

  async function detailOf(user: SignedInUser, campaignId: string): Promise<CampaignDetailDto> {
    const cookies = { lk_session: user.token };
    const response = await app.inject({
      method: 'GET',
      url: `/api/campaigns/${campaignId}`,
      cookies,
    });
    expect(response.statusCode).toBe(200);
    return campaignResponseDto.parse(response.json()).campaign;
  }

  it("the session:state of Bia's table carries each member's plan", async () => {
    const state = await joined(caio, tavern.id);

    expect(state.members).toMatchObject([
      { userId: bia.id, plan: 'free' },
      { userId: caio.id, plan: 'lenda' },
    ]);
  });

  it("the detail of Bia's table carries the free limits (5 grids) and the plan of each member", async () => {
    const detail = await detailOf(caio, tavern.id);

    expect(detail.limits).toEqual(PLAN_LIMITS.free);
    expect(detail.limits.maxScenes).toBe(5);
    expect(detail.members).toMatchObject([
      { userId: bia.id, plan: 'free' },
      { userId: caio.id, plan: 'lenda' },
    ]);
  });

  it('the list of my tables carries the limits of each owner', async () => {
    const cookies = { lk_session: bia.token };
    const response = await app.inject({ method: 'GET', url: '/api/campaigns', cookies });

    expect(response.json().campaigns).toMatchObject([{ id: tavern.id, limits: PLAN_LIMITS.free }]);
  });

  it('a table whose owner is an admin gets the limits of amigo_do_dono; he shows his stored plan and admin', async () => {
    const detail = await detailOf(root, quelm.id);
    const state = await joined(root, quelm.id);

    expect(detail.limits).toEqual(PLAN_LIMITS.amigo_do_dono);
    const seal = { userId: root.id, plan: 'free', admin: true, lorkariumOwner: false };
    expect(state.members).toMatchObject([seal]);
    expect(detail.members).toMatchObject([seal]);
  });

  it('the session:state and the detail of Quelm carry none of the Taverna: members nor limits', async () => {
    await joined(caio, tavern.id);
    const state = await joined(root, quelm.id);
    const detail = await detailOf(root, quelm.id);

    expect(state.members.map(({ userId }) => userId)).toEqual([root.id]);
    expect(detail.members.map(({ userId }) => userId)).toEqual([root.id]);
    expect(detail.limits.plan).toBe('amigo_do_dono');
  });
});
