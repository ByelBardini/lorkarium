import {
  accountSanctionsResponseDto,
  apiErrorDto,
  sanctionResponseDto,
} from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { users } from '../../src/modules/auth/users.po';
import { HousekeepingDao } from '../../src/modules/housekeeping/housekeeping.dao';
import { bannedEmailIndexes } from '../../src/modules/sanctions/banned-email-indexes.po';
import { MailerFake } from '../support/account-security-fakes';
import { connectRealtime, disconnectionOf, type RealtimeClient } from '../support/realtime-client';
import { insertTestAccount, logIn, type SignedInUser } from '../support/sign-in';
import { createTable, joinByCode } from '../support/tables';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const PASSWORD = 'senha-de-teste';
const CONTACT = 'contato@lorkarium.example.com';
const HARASSMENT = { rule: 'harassment', statement: 'Ameaçou um jogador real no chat.' } as const;

describe('measures against an account (/api/admin/users/:userId/sanctions)', () => {
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let mailer: MailerFake;
  let baseUrl: string;
  let admin: SignedInUser;
  let caio: SignedInUser;
  let bia: SignedInUser;
  const sockets: RealtimeClient[] = [];

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    mailer = new MailerFake();
    const env = { ...readEnv(process.env), adminSeed: null, mailReplyTo: CONTACT };
    app = await buildApp({ env, db: connection.db, mailer });
    baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
    admin = await account('Fernanda', 'admin');
    caio = await account('Caio');
    bia = await account('Bia');
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
    method: 'GET' | 'POST' | 'PUT',
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

  function issue(userId: string, body: object, token = admin.token) {
    return call('POST', `/admin/users/${userId}/sanctions`, token, body);
  }

  describe('apply', () => {
    it('a warning is 201 with the measure and the account, e-mailed with the contact as Reply-To', async () => {
      const response = await issue(caio.id, { kind: 'warning', ...HARASSMENT });

      expect(response.statusCode).toBe(201);
      const { sanction, user } = sanctionResponseDto.parse(response.json());
      expect(sanction).toMatchObject({ kind: 'warning', rule: 'harassment', issuedBy: 'fernanda' });
      expect(user).toMatchObject({ id: caio.id, status: 'active' });
      const [mail] = mailer.to('caio@mesa.com');
      expect(mail).toMatchObject({
        subject: 'Um aviso sobre a sua conta no Lorkarium',
        replyTo: CONTACT,
      });
      expect(mail?.text).not.toContain('fernanda');
    });

    it('a suspension until next week drops the open session and socket, and the login is 403', async () => {
      const socket = await connectRealtime(baseUrl, { token: caio.token });
      sockets.push(socket);
      const dropped = disconnectionOf(socket);
      const until = new Date(Date.now() + 7 * 86_400_000).toISOString();

      const response = await issue(caio.id, { kind: 'suspension', ...HARASSMENT, until });

      expect(sanctionResponseDto.parse(response.json()).user.status).toBe('suspended');
      await dropped;
      expect((await call('GET', '/auth/me', caio.token)).json()).toEqual({ user: null });
      const login = await call('POST', '/auth/login', undefined, {
        identifier: 'caio@mesa.com',
        password: PASSWORD,
      });
      expect(codeOf(login)).toBe('ACCOUNT_SUSPENDED');
      const [row] = await connection.db.select().from(users).where(eq(users.id, caio.id));
      expect(row?.suspendedUntil?.toISOString()).toBe(until);
      expect(mailer.to('caio@mesa.com')[0]?.subject).toBe('Sua conta no Lorkarium foi suspensa');
    });

    it('suspending twice is 409 ALREADY_SUSPENDED', async () => {
      await issue(caio.id, { kind: 'suspension', ...HARASSMENT });
      expect(codeOf(await issue(caio.id, { kind: 'suspension', ...HARASSMENT }))).toBe(
        'ALREADY_SUSPENDED',
      );
    });

    it('an end in the past is 400 SANCTION_UNTIL_PAST and an end on a warning 400', async () => {
      const past = new Date(Date.now() - 60_000).toISOString();
      expect(codeOf(await issue(caio.id, { kind: 'suspension', ...HARASSMENT, until: past }))).toBe(
        'SANCTION_UNTIL_PAST',
      );
      const onWarning = await issue(caio.id, { kind: 'warning', ...HARASSMENT, until: past });
      expect(onWarning.statusCode).toBe(400);
    });

    it('oneself is 409 SELF_ACTION, another admin 409 TARGET_IS_ADMIN, an unknown account 404', async () => {
      expect(codeOf(await issue(admin.id, { kind: 'warning', ...HARASSMENT }))).toBe('SELF_ACTION');
      await connection.db.update(users).set({ role: 'admin' }).where(eq(users.id, bia.id));
      expect(codeOf(await issue(bia.id, { kind: 'warning', ...HARASSMENT }))).toBe(
        'TARGET_IS_ADMIN',
      );
      const unknown = '44444444-4444-4444-8444-444444444444';
      expect(codeOf(await issue(unknown, { kind: 'warning', ...HARASSMENT }))).toBe(
        'USER_NOT_FOUND',
      );
    });

    it('a report that does not exist is 404 SANCTION_REPORT_NOT_FOUND', async () => {
      const reportId = '55555555-5555-4555-8555-555555555555';
      const response = await issue(caio.id, { kind: 'warning', ...HARASSMENT, reportId });
      expect(codeOf(response)).toBe('SANCTION_REPORT_NOT_FOUND');
    });

    it('no session is 401 and a player is 403, on every route', async () => {
      const body = { kind: 'warning', ...HARASSMENT };
      expect((await issue(caio.id, body, '')).statusCode).toBe(401);
      expect(codeOf(await issue(caio.id, body, bia.token))).toBe('FORBIDDEN_ROLE');
      expect(codeOf(await call('GET', `/admin/users/${caio.id}/sanctions`, bia.token))).toBe(
        'FORBIDDEN_ROLE',
      );
      const appeal = `/admin/sanctions/55555555-5555-4555-8555-555555555555/appeal`;
      expect(codeOf(await call('PUT', appeal, bia.token, { outcome: 'received' }))).toBe(
        'FORBIDDEN_ROLE',
      );
    });
  });

  describe('ban', () => {
    it('is 204: the e-mail goes, the account is gone and its e-mail cannot be invited again (409)', async () => {
      const response = await issue(caio.id, { kind: 'ban', ...HARASSMENT });

      expect(response.statusCode).toBe(204);
      expect(mailer.to('caio@mesa.com').map((mail) => mail.subject)).toEqual([
        'Sua conta no Lorkarium foi excluída',
      ]);
      expect(await connection.db.select().from(users).where(eq(users.id, caio.id))).toEqual([]);
      const invite = await call('POST', '/admin/invitations', admin.token, {
        email: 'Caio@Mesa.com',
        role: 'user',
      });
      expect(invite.statusCode).toBe(409);
      expect(invite.json()).toMatchObject({ code: 'EMAIL_BANNED' });
      expect(invite.body).not.toContain('caio@mesa.com');
    });

    it('owning a table where others play is 409 OWNS_SHARED_CAMPAIGNS: no e-mail, no ban', async () => {
      const table = await createTable(app, caio, 'Vharn');
      await joinByCode(app, bia, table);

      const response = await issue(caio.id, { kind: 'ban', ...HARASSMENT });

      expect(codeOf(response)).toBe('OWNS_SHARED_CAMPAIGNS');
      expect(mailer.to('caio@mesa.com')).toEqual([]);
      expect(await connection.db.select().from(bannedEmailIndexes)).toEqual([]);
    });

    it('the housekeeping drops a ban older than 5 years and keeps a recent one', async () => {
      const now = new Date();
      const old = new Date(now.getTime() - (5 * 365 + 3) * 86_400_000);
      await connection.db.insert(bannedEmailIndexes).values([
        { emailIndex: 'idx-old', bannedAt: old },
        { emailIndex: 'idx-new', bannedAt: now },
      ]);
      const cut = new Date(now.getTime() - (5 * 365 + 2) * 86_400_000);

      await new HousekeepingDao(connection.db).deleteBefore('banned_emails', cut, 1000);

      const left = await connection.db.select().from(bannedEmailIndexes);
      expect(left.map((row) => row.emailIndex)).toEqual(['idx-new']);
    });
  });

  describe('history and appeal', () => {
    it('the history lists the measure with its appeal; reverting the suspension lets the login in', async () => {
      const suspended = await issue(caio.id, { kind: 'suspension', ...HARASSMENT });
      const { sanction } = sanctionResponseDto.parse(suspended.json());
      const appeal = `/admin/sanctions/${sanction.id}/appeal`;

      await call('PUT', appeal, admin.token, { outcome: 'received' });
      const decided = await call('PUT', appeal, admin.token, {
        outcome: 'reverted',
        note: 'Era outra pessoa na conta.',
      });

      expect(sanctionResponseDto.parse(decided.json()).user.status).toBe('active');
      const history = await call('GET', `/admin/users/${caio.id}/sanctions`, admin.token);
      const [item] = accountSanctionsResponseDto.parse(history.json()).sanctions;
      expect(item?.appeal).toMatchObject({
        outcome: 'reverted',
        note: 'Era outra pessoa na conta.',
        decidedBy: 'fernanda',
      });
      const login = await call('POST', '/auth/login', undefined, {
        identifier: 'caio@mesa.com',
        password: PASSWORD,
      });
      expect(login.statusCode).toBe(200);
      expect(mailer.to('caio@mesa.com').at(-1)?.subject).toBe('Seu acesso ao Lorkarium voltou');
    });

    it('a second decision is 409 APPEAL_ALREADY_DECIDED and an unknown measure 404', async () => {
      const warned = await issue(caio.id, { kind: 'warning', ...HARASSMENT });
      const { sanction } = sanctionResponseDto.parse(warned.json());
      const appeal = `/admin/sanctions/${sanction.id}/appeal`;
      await call('PUT', appeal, admin.token, { outcome: 'upheld', note: 'Mantida.' });

      const again = await call('PUT', appeal, admin.token, { outcome: 'reverted', note: 'x' });

      expect(codeOf(again)).toBe('APPEAL_ALREADY_DECIDED');
      const unknown = '/admin/sanctions/55555555-5555-4555-8555-555555555555/appeal';
      expect(codeOf(await call('PUT', unknown, admin.token, { outcome: 'received' }))).toBe(
        'SANCTION_NOT_FOUND',
      );
    });

    it('the history of one account never shows the measures of another', async () => {
      await issue(caio.id, { kind: 'warning', ...HARASSMENT });
      const history = await call('GET', `/admin/users/${bia.id}/sanctions`, admin.token);
      expect(accountSanctionsResponseDto.parse(history.json()).sanctions).toEqual([]);
    });
  });
});
