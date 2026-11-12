import {
  PLAN_LIMITS,
  adminDirectoryResponseDto,
  adminUserResponseDto,
  apiErrorDto,
  sessionCampaignUpdatedDto,
  sessionMemberUpdatedDto,
} from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { users } from '../../src/modules/auth/users.po';
import { atTable, eventPayload, silence } from '../support/live-table';
import {
  recordEventsOf,
  type EventRecorder,
  type RealtimeClient,
} from '../support/realtime-client';
import { insertTestAccount, logIn, type SignedInUser } from '../support/sign-in';
import { createTable, joinByCode, type Table } from '../support/tables';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const PASSWORD = 'senha-de-teste';

describe('the backoffice changes the plan and the role (/api/admin/users/:id/*)', () => {
  const clients: RealtimeClient[] = [];
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let baseUrl: string;
  let admin: SignedInUser;
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
    app = await buildApp({ env: { ...readEnv(process.env), adminSeed: null }, db: connection.db });
    baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
    admin = await account('Fernanda', 'admin');
    ana = await account('Ana');
    bia = await account('Bia');
    caio = await account('Caio');
    vharn = await createTable(app, ana, 'Os Sinos de Vharn');
    quelm = await createTable(app, caio, 'Quelm');
    await joinByCode(app, bia, vharn);
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.close();
    await app.close();
  });

  async function account(name: string, role: 'user' | 'admin' = 'user'): Promise<SignedInUser> {
    const email = `${name.toLowerCase()}@mesa.com`;
    const row = await insertTestAccount(connection.db, { name, email, password: PASSWORD });
    if (role === 'admin') {
      await connection.db.update(users).set({ role }).where(eq(users.id, row.id));
    }
    return { id: row.id, token: await logIn(app, email, PASSWORD) };
  }

  function patch(url: string, token: string, payload: object): Promise<LightMyRequestResponse> {
    const cookies = { lk_session: token };
    return app.inject({ method: 'PATCH', url: `/api/admin/users${url}`, cookies, payload });
  }

  async function listening(user: SignedInUser, table: Table): Promise<EventRecorder> {
    return recordEventsOf(await atTable(baseUrl, clients, user, table));
  }

  function eventsNamed(recorder: EventRecorder, name: string): unknown[] {
    return recorder.events.filter((event) => event.name === name).map(({ payload }) => payload);
  }

  describe('PATCH /:userId/plan', () => {
    it('Ana goes lenda: 200 with the plan, stored, and listed so in the backoffice', async () => {
      const response = await patch(`/${ana.id}/plan`, admin.token, { plan: 'lenda' });

      expect(response.statusCode).toBe(200);
      expect(adminUserResponseDto.parse(response.json()).user).toMatchObject({
        id: ana.id,
        plan: 'lenda',
      });
      const cookies = { lk_session: admin.token };
      const listed = await app.inject({ method: 'GET', url: '/api/admin/users', cookies });
      const found = adminDirectoryResponseDto.parse(listed.json()).users.find((user) => {
        return user.id === ana.id;
      });
      expect(found?.plan).toBe('lenda');
    });

    it("Bia at Vharn hears Ana's new seal and, Ana owning it, the table's new limits", async () => {
      const biaAtVharn = await listening(bia, vharn);

      await patch(`/${ana.id}/plan`, admin.token, { plan: 'lenda' });

      const updated = sessionMemberUpdatedDto.parse(
        await eventPayload(biaAtVharn, 'session:memberUpdated'),
      );
      expect(updated.member).toMatchObject({ userId: ana.id, plan: 'lenda' });
      const campaign = sessionCampaignUpdatedDto.parse(
        await eventPayload(biaAtVharn, 'session:campaignUpdated'),
      );
      expect(campaign).toMatchObject({ campaignId: vharn.id, campaign: { ownerId: ana.id } });
      expect(campaign.campaign.limits).toEqual(PLAN_LIMITS.lenda);
    });

    it('Bia goes Apoiador from the "Plano" route: stored, and Ana at Vharn hears her seal', async () => {
      const anaAtVharn = await listening(ana, vharn);

      const response = await patch(`/${bia.id}/plan`, admin.token, { plan: 'apoiador' });

      expect(response.statusCode).toBe(200);
      expect(adminUserResponseDto.parse(response.json()).user.plan).toBe('apoiador');
      const updated = sessionMemberUpdatedDto.parse(
        await eventPayload(anaAtVharn, 'session:memberUpdated'),
      );
      expect(updated.member).toMatchObject({ userId: bia.id, plan: 'apoiador' });
    });

    it('the old Apoiador route is gone: 404', async () => {
      const response = await patch(`/${bia.id}/supporter`, admin.token, { supporter: true });

      expect(response.statusCode).toBe(404);
    });

    it("Bia's plan reaches Vharn as her seal only: she does not own it, so its limits stay", async () => {
      const anaAtVharn = await listening(ana, vharn);

      await patch(`/${bia.id}/plan`, admin.token, { plan: 'narrador' });

      const updated = sessionMemberUpdatedDto.parse(
        await eventPayload(anaAtVharn, 'session:memberUpdated'),
      );
      expect(updated.member).toMatchObject({ userId: bia.id, plan: 'narrador' });
      await silence();
      expect(eventsNamed(anaAtVharn, 'session:campaignUpdated')).toEqual([]);
    });

    it("Caio at Quelm hears nothing of Ana's plan", async () => {
      const caioAtQuelm = await listening(caio, quelm);

      await patch(`/${ana.id}/plan`, admin.token, { plan: 'lenda' });

      await silence();
      expect(caioAtQuelm.events).toEqual([]);
    });

    it('the admin changes their own plan: 200, not SELF_ACTION', async () => {
      const response = await patch(`/${admin.id}/plan`, admin.token, { plan: 'narrador' });

      expect(response.statusCode).toBe(200);
      expect(adminUserResponseDto.parse(response.json()).user.plan).toBe('narrador');
    });

    it('a user asking is 403 FORBIDDEN_ROLE and the plan stays', async () => {
      const response = await patch(`/${bia.id}/plan`, ana.token, { plan: 'lenda' });

      expect(response.statusCode).toBe(403);
      expect(apiErrorDto.parse(response.json()).code).toBe('FORBIDDEN_ROLE');
      const [row] = await connection.db.select().from(users).where(eq(users.id, bia.id));
      expect(row?.plan).toBe('free');
    });

    it("{ plan: 'pro' } is 400 INVALID_BODY", async () => {
      const response = await patch(`/${ana.id}/plan`, admin.token, { plan: 'pro' });

      expect(response.statusCode).toBe(400);
      expect(apiErrorDto.parse(response.json()).code).toBe('INVALID_BODY');
    });

    it('an account that does not exist is 404 USER_NOT_FOUND', async () => {
      const missing = '99999999-9999-4999-8999-999999999999';

      const response = await patch(`/${missing}/plan`, admin.token, { plan: 'lenda' });

      expect(response.statusCode).toBe(404);
      expect(apiErrorDto.parse(response.json()).code).toBe('USER_NOT_FOUND');
    });

    it('without a session it is 401', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/users/${ana.id}/plan`,
        payload: { plan: 'lenda' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('PATCH /:userId (the global role)', () => {
    it("Ana made admin: Bia at Vharn hears her Admin seal and, Ana owning it, the table's limits", async () => {
      const biaAtVharn = await listening(bia, vharn);

      const response = await patch(`/${ana.id}`, admin.token, { role: 'admin' });

      expect(response.statusCode).toBe(200);
      const updated = sessionMemberUpdatedDto.parse(
        await eventPayload(biaAtVharn, 'session:memberUpdated'),
      );
      expect(updated.member).toMatchObject({ userId: ana.id, plan: 'free', admin: true });
      const campaign = sessionCampaignUpdatedDto.parse(
        await eventPayload(biaAtVharn, 'session:campaignUpdated'),
      );
      expect(campaign.campaign.limits).toEqual(PLAN_LIMITS.amigo_do_dono);
    });

    it('the role she already has tells Vharn nothing', async () => {
      const biaAtVharn = await listening(bia, vharn);

      await patch(`/${ana.id}`, admin.token, { role: 'user' });

      await silence();
      expect(eventsNamed(biaAtVharn, 'session:memberUpdated')).toEqual([]);
    });
  });
});
