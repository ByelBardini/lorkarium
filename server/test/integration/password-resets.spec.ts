import { apiErrorDto, passwordResetLinkResponseDto } from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { users } from '../../src/modules/auth/users.po';
import { MailerFake } from '../support/account-security-fakes';
import { totpCodeAt } from '../support/account-security-http';
import { ClockFake } from '../support/auth-fakes';
import { insertTestAccount, logIn, type SignedInUser } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const PASSWORD = 'senha-de-teste';
const NEW_PASSWORD = 'senha-nova-da-bia';
const ONE_HOUR_MS = 60 * 60 * 1000;

describe('new-password link from the backoffice', () => {
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let mailer: MailerFake;
  let clock: ClockFake;
  let admin: SignedInUser;
  let bia: SignedInUser;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    mailer = new MailerFake();
    clock = new ClockFake(new Date());
    const env = {
      ...readEnv(process.env),
      adminSeed: null,
      appPublicUrl: 'https://mesa.example.com',
    };
    app = await buildApp({ env, db: connection.db, mailer, clock });
    admin = await account('Lucas', 'admin');
    bia = await account('Bia');
  });

  afterEach(() => app.close());

  async function account(name: string, role: 'user' | 'admin' = 'user'): Promise<SignedInUser> {
    const email = `${name.toLowerCase()}@mesa.com`;
    const row = await insertTestAccount(connection.db, { name, email, password: PASSWORD });
    if (role === 'admin')
      await connection.db.update(users).set({ role }).where(eq(users.id, row.id));
    return { id: row.id, token: await logIn(app, email, PASSWORD) };
  }

  function post(url: string, payload?: object, token?: string): Promise<LightMyRequestResponse> {
    return app.inject({
      method: 'POST',
      url: `/api${url}`,
      cookies: token ? { lk_session: token } : {},
      ...(payload ? { payload } : {}),
    });
  }

  async function issue(userId = bia.id): Promise<string> {
    const response = await post(`/admin/users/${userId}/password-reset`, undefined, admin.token);
    const { link } = passwordResetLinkResponseDto.parse(response.json());
    return decodeURIComponent(link.split('#token=')[1] ?? '');
  }

  function login(password: string) {
    return post('/auth/login', { identifier: 'bia@mesa.com', password });
  }

  it('the admin gets the one-hour link, also mailed; inspect names the @', async () => {
    const token = await issue();
    expect(mailer.lastTokenFor('bia@mesa.com', /\/reset-password#token=([^\s"<]+)/)).toBe(token);
    expect((await post('/password-resets/inspect', { token })).json()).toEqual({ username: 'bia' });
  });

  it('completing: 204, the old cookie out, the old password refused and the new one in', async () => {
    const token = await issue();
    const response = await post('/password-resets/complete', { token, newPassword: NEW_PASSWORD });
    expect(response.statusCode).toBe(204);
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { lk_session: bia.token },
    });
    expect(me.json()).toEqual({ user: null });
    expect((await login(PASSWORD)).statusCode).toBe(401);
    expect((await login(NEW_PASSWORD)).statusCode).toBe(200);
    expect(mailer.to('bia@mesa.com').at(-1)?.subject).toBe('Sua senha do Lorkarium foi trocada');
    expect(
      (await post('/password-resets/complete', { token, newPassword: 'outra-senha-1' })).statusCode,
    ).toBe(404);
  });

  it('a link past its hour is 404', async () => {
    const token = await issue();
    clock.current = new Date(clock.current.getTime() + ONE_HOUR_MS);
    expect((await post('/password-resets/inspect', { token })).statusCode).toBe(404);
  });

  it('to the own account is 409 SELF_ACTION; to a suspended one 409 ACCOUNT_SUSPENDED', async () => {
    const self = await post(`/admin/users/${admin.id}/password-reset`, undefined, admin.token);
    expect(apiErrorDto.parse(self.json()).code).toBe('SELF_ACTION');
    await post(`/admin/users/${bia.id}/suspend`, undefined, admin.token);
    const suspended = await post(`/admin/users/${bia.id}/password-reset`, undefined, admin.token);
    expect(apiErrorDto.parse(suspended.json()).code).toBe('ACCOUNT_SUSPENDED');
  });

  it('suspending deletes a pending link', async () => {
    const token = await issue();
    await post(`/admin/users/${bia.id}/suspend`, undefined, admin.token);
    expect((await post('/password-resets/inspect', { token })).statusCode).toBe(404);
  });

  it('with 2FA on, the login after the new password still asks for the code', async () => {
    const setup = await post('/account/two-factor/setup', { currentPassword: PASSWORD }, bia.token);
    const { secret } = setup.json() as { secret: string };
    await post('/account/two-factor/enable', { code: totpCodeAt(secret, clock.now()) }, bia.token);
    const token = await issue();
    await post('/password-resets/complete', { token, newPassword: NEW_PASSWORD });
    expect((await login(NEW_PASSWORD)).json()).toEqual({ status: 'two-factor-required' });
  });
});
