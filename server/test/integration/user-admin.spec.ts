import {
  adminDirectoryResponseDto,
  adminUserResponseDto,
  apiErrorDto,
  mailSamplesResponseDto,
  userDeletionCheckDto,
} from '@lorkarium/contracts';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { users } from '../../src/modules/auth/users.po';
import { MailerFake } from '../support/account-security-fakes';
import { connectRealtime, disconnectionOf, type RealtimeClient } from '../support/realtime-client';
import { insertTestAccount, logIn, type SignedInUser } from '../support/sign-in';
import { createTable, joinByCode } from '../support/tables';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const PASSWORD = 'senha-de-teste';

describe('backoffice over the accounts (/api/admin/users)', () => {
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let mailer: MailerFake;
  let baseUrl: string;
  let admin: SignedInUser;
  let ana: SignedInUser;
  let bia: SignedInUser;
  let caio: SignedInUser;
  const sockets: RealtimeClient[] = [];

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    mailer = new MailerFake();
    app = await buildApp({
      env: { ...readEnv(process.env), adminSeed: null },
      db: connection.db,
      mailer,
    });
    baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
    admin = await account('Fernanda', 'admin');
    ana = await account('Ana');
    bia = await account('Bia');
    caio = await account('Caio');
  });

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.close();
    await app.close();
  });

  async function account(name: string, role: 'user' | 'admin' = 'user'): Promise<SignedInUser> {
    const email = `${name.toLowerCase()}@mesa.com`;
    const row = await insertTestAccount(connection.db, { name, email, password: PASSWORD });
    if (role === 'admin')
      await connection.db.update(users).set({ role }).where(eq(users.id, row.id));
    return { id: row.id, token: await logIn(app, email, PASSWORD) };
  }

  function call(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    token?: string,
    payload?: object,
  ): Promise<LightMyRequestResponse> {
    return app.inject({
      method,
      url: `/api${url}`,
      cookies: token ? { lk_session: token } : {},
      ...(payload ? { payload } : {}),
    });
  }

  function codeOf(response: LightMyRequestResponse): string {
    return apiErrorDto.parse(response.json()).code;
  }

  describe('list', () => {
    it('the admin gets every account with the e-mail, the tables and the last seen, newest first', async () => {
      await createTable(app, ana, 'Vharn');
      await createTable(app, ana, 'Quelm');
      const response = await call('GET', '/admin/users', admin.token);
      expect(response.statusCode).toBe(200);
      const { users: listed, invitations } = adminDirectoryResponseDto.parse(response.json());
      expect(listed.map((user) => user.username)).toEqual(['caio', 'bia', 'ana', 'fernanda']);
      expect(listed.find((user) => user.id === ana.id)).toMatchObject({
        email: 'ana@mesa.com',
        campaignCount: 2,
        status: 'active',
      });
      expect(listed.find((user) => user.id === bia.id)?.campaignCount).toBe(0);
      expect(listed.find((user) => user.id === bia.id)?.lastSeenAt).not.toBeNull();
      expect(invitations).toEqual([]);
    });

    it('the body never carries the hash nor the sealed columns', async () => {
      const body = (await call('GET', '/admin/users', admin.token)).body;
      expect(body).not.toMatch(
        /password_hash|passwordHash|email_cipher|emailCipher|emailIndex|argon2/,
      );
    });

    it('a player is 403 FORBIDDEN_ROLE and no cookie is 401', async () => {
      expect(codeOf(await call('GET', '/admin/users', ana.token))).toBe('FORBIDDEN_ROLE');
      expect((await call('GET', '/admin/users')).statusCode).toBe(401);
    });
  });

  describe('role and suspension', () => {
    it('suspending Ana: her cookie stops working, her socket drops, her login is 403', async () => {
      const socket = await connectRealtime(baseUrl, { token: ana.token });
      sockets.push(socket);
      const dropped = disconnectionOf(socket);
      const response = await call('POST', `/admin/users/${ana.id}/suspend`, admin.token);
      expect(adminUserResponseDto.parse(response.json()).user.status).toBe('suspended');
      await dropped;
      expect((await call('GET', '/auth/me', ana.token)).json()).toEqual({ user: null });
      const login = await call('POST', '/auth/login', undefined, {
        email: 'ana@mesa.com',
        password: PASSWORD,
      });
      expect(codeOf(login)).toBe('ACCOUNT_SUSPENDED');
      expect(mailer.to('ana@mesa.com').map((mail) => mail.subject)).toEqual([
        'Seu acesso ao Lorkarium foi suspenso',
      ]);
    });

    it('reactivating lets the login in again', async () => {
      await call('POST', `/admin/users/${ana.id}/suspend`, admin.token);
      await call('POST', `/admin/users/${ana.id}/reactivate`, admin.token);
      const login = await call('POST', '/auth/login', undefined, {
        email: 'ana@mesa.com',
        password: PASSWORD,
      });
      expect(login.statusCode).toBe(200);
    });

    it('making Bia admin opens the list to her; taking it away closes it', async () => {
      await call('PATCH', `/admin/users/${bia.id}`, admin.token, { role: 'admin' });
      expect((await call('GET', '/admin/users', bia.token)).statusCode).toBe(200);
      await call('PATCH', `/admin/users/${bia.id}`, admin.token, { role: 'user' });
      expect((await call('GET', '/admin/users', bia.token)).statusCode).toBe(403);
    });

    it('the admin on themselves is 409 SELF_ACTION', async () => {
      expect(codeOf(await call('POST', `/admin/users/${admin.id}/suspend`, admin.token))).toBe(
        'SELF_ACTION',
      );
      expect(
        codeOf(await call('PATCH', `/admin/users/${admin.id}`, admin.token, { role: 'user' })),
      ).toBe('SELF_ACTION');
    });

    it('a malformed id is 400 and an unknown one 404', async () => {
      expect((await call('POST', '/admin/users/nao-e-uuid/suspend', admin.token)).statusCode).toBe(
        400,
      );
      const unknown = '44444444-4444-4444-8444-444444444444';
      expect(codeOf(await call('POST', `/admin/users/${unknown}/suspend`, admin.token))).toBe(
        'USER_NOT_FOUND',
      );
    });
  });

  describe('delete', () => {
    it('Bia with a table of her own: the check counts it, the delete takes the account and the table', async () => {
      const solo = await createTable(app, bia, 'Só da Bia');
      const check = await call('GET', `/admin/users/${bia.id}/deletion-check`, admin.token);
      expect(userDeletionCheckDto.parse(check.json())).toEqual({
        blockingCampaigns: [],
        soloCampaigns: 1,
      });
      const socket = await connectRealtime(baseUrl, { token: bia.token });
      sockets.push(socket);
      const dropped = disconnectionOf(socket);
      expect((await call('DELETE', `/admin/users/${bia.id}`, admin.token)).statusCode).toBe(204);
      await dropped;
      const left = await connection.db.execute(
        sql`SELECT count(*)::int AS n FROM campaigns WHERE id = ${solo.id}`,
      );
      expect(left.rows[0]).toEqual({ n: 0 });
      expect((await call('GET', '/auth/me', bia.token)).json()).toEqual({ user: null });
    });

    it('Ana owning Vharn with Caio is 409 OWNS_SHARED_CAMPAIGNS naming Vharn, and nothing changes', async () => {
      const vharn = await createTable(app, ana, 'Vharn');
      await joinByCode(app, caio, vharn);
      const response = await call('DELETE', `/admin/users/${ana.id}`, admin.token);
      expect(response.statusCode).toBe(409);
      expect(apiErrorDto.parse(response.json()).blockingCampaigns).toEqual([
        { id: vharn.id, name: 'Vharn', otherMembers: 1 },
      ]);
      expect((await call('GET', '/auth/me', ana.token)).json()).not.toEqual({ user: null });
    });

    it("deleting Bia, a member of Ana's table, keeps the table and Caio's own table intact", async () => {
      const vharn = await createTable(app, ana, 'Vharn');
      const quelm = await createTable(app, caio, 'Quelm');
      await joinByCode(app, bia, vharn);
      await call('DELETE', `/admin/users/${bia.id}`, admin.token);
      const left = await connection.db.execute(
        sql`SELECT count(*)::int AS n FROM campaigns WHERE id IN (${vharn.id}, ${quelm.id})`,
      );
      expect(left.rows[0]).toEqual({ n: 2 });
      const members = await connection.db.execute(
        sql`SELECT count(*)::int AS n FROM campaign_members WHERE campaign_id = ${vharn.id}`,
      );
      expect(members.rows[0]).toEqual({ n: 1 });
    });

    it('the admin on themselves is 409', async () => {
      expect(codeOf(await call('DELETE', `/admin/users/${admin.id}`, admin.token))).toBe(
        'SELF_ACTION',
      );
    });

    it('joining by code a table whose owner is being deleted ends in CAMPAIGN_NOT_FOUND (23503)', async () => {
      const solo = await createTable(app, bia, 'Só da Bia');
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => (release = resolve));
      const deletion = connection.db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM campaigns WHERE id = ${solo.id} FOR UPDATE`);
        await tx.execute(sql`DELETE FROM users WHERE id = ${bia.id}`);
        await held;
      });
      const join = call('POST', '/campaigns/join', caio.token, { code: solo.joinCode });
      await new Promise((resolve) => setTimeout(resolve, 300));
      release();
      await deletion;
      expect(codeOf(await join)).toBe('CAMPAIGN_NOT_FOUND');
    });
  });

  describe('mail test', () => {
    it('the admin lists the 11 system e-mails and a player is 403', async () => {
      const response = await call('GET', '/admin/mail-samples', admin.token);
      expect(mailSamplesResponseDto.parse(response.json()).samples).toHaveLength(11);
      expect(codeOf(await call('GET', '/admin/mail-samples', ana.token))).toBe('FORBIDDEN_ROLE');
    });

    it('sending one reaches the typed address through the mailer', async () => {
      const response = await call(
        'POST',
        '/admin/mail-samples/access-suspended/send',
        admin.token,
        {
          to: ' Eu@Exemplo.com ',
        },
      );
      expect(response.json()).toEqual({
        subject: 'Seu acesso ao Lorkarium foi suspenso',
        to: 'eu@exemplo.com',
      });
      expect(mailer.to('eu@exemplo.com').map((mail) => mail.subject)).toEqual([
        'Seu acesso ao Lorkarium foi suspenso',
      ]);
    });

    it('an invalid address is 400 and an unknown sample 404', async () => {
      const invalid = await call('POST', '/admin/mail-samples/invitation/send', admin.token, {
        to: 'eu',
      });
      expect(invalid.statusCode).toBe(400);
      const unknown = await call('POST', '/admin/mail-samples/newsletter/send', admin.token, {
        to: 'eu@x.com',
      });
      expect(codeOf(unknown)).toBe('MAIL_SAMPLE_NOT_FOUND');
    });

    it('a mailer down answers 502 MAIL_DELIVERY_FAILED', async () => {
      mailer.failWith = new Error('connect ECONNREFUSED');
      const response = await call('POST', '/admin/mail-samples/invitation/send', admin.token, {
        to: 'eu@x.com',
      });
      expect(response.statusCode).toBe(502);
      expect(codeOf(response)).toBe('MAIL_DELIVERY_FAILED');
    });
  });
});
