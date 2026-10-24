import { accountRecoveryCheckResponseDto, apiErrorDto } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { MailerFake } from '../support/account-security-fakes';
import { accountRequest, cookieOf, logInAs, totpCodeAt } from '../support/account-security-http';
import { ClockFake } from '../support/auth-fakes';
import { insertTestAccount } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const PASSWORD = 'senha-da-ana';
const NEW_PASSWORD = 'senha-recuperada';
const APP_PUBLIC_URL = 'https://mesa.example.com';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

describe('account recovery by link', () => {
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let mailer: MailerFake;
  let clock: ClockFake;
  let ana: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    await insertTestAccount(connection.db, {
      name: 'Ana',
      email: 'ana@mesa.com',
      password: PASSWORD,
    });
    await insertTestAccount(connection.db, {
      name: 'Bia',
      email: 'bia@mesa.com',
      password: PASSWORD,
    });
    mailer = new MailerFake();
    clock = new ClockFake(new Date());
    const env = { ...readEnv(process.env), adminSeed: null, appPublicUrl: APP_PUBLIC_URL };
    app = await buildApp({ env, db: connection.db, mailer, clock });
    ana = await logInAs(app, 'ana@mesa.com', PASSWORD);
  });

  afterEach(() => app.close());

  function post(url: string, payload: object, token?: string) {
    return accountRequest(app, { method: 'POST', url, payload, ...(token ? { token } : {}) });
  }

  async function changePassword(): Promise<string> {
    const change = { currentPassword: PASSWORD, newPassword: 'senha-do-invasor' };
    await post('/api/account/password', change, ana);
    return mailer.recoveryTokenFor('ana@mesa.com');
  }

  async function changeEmail(from: string, to: string, password: string, session: string) {
    await post('/api/account/email', { newEmail: to, currentPassword: password }, session);
    await post('/api/account/email/confirm', { token: mailer.confirmationTokenFor(to) });
    return mailer.recoveryTokenFor(from);
  }

  function recover(token: string, newPassword = NEW_PASSWORD) {
    return post('/api/account/recovery', { token, newPassword });
  }

  function login(email: string, password: string) {
    return post('/api/auth/login', { email, password });
  }

  async function me(session: string) {
    const response = await accountRequest(app, {
      method: 'GET',
      url: '/api/auth/me',
      token: session,
    });
    return (response.json() as { user: unknown }).user;
  }

  it('check of a live link answers its kind; an invented one is 404', async () => {
    const token = await changePassword();
    const check = await post('/api/account/recovery/check', { token });
    expect(accountRecoveryCheckResponseDto.parse(check.json()).recovery).toEqual({
      kind: 'revert-password-change',
      email: null,
    });
    const invented = await post('/api/account/recovery/check', { token: 'inventado' });
    expect(invented.statusCode).toBe(404);
    expect(apiErrorDto.parse(invented.json()).code).toBe('RECOVERY_TOKEN_INVALID');
  });

  it('revert-password-change: 204, every session out, the new password in, the link dead', async () => {
    const phone = await logInAs(app, 'ana@mesa.com', PASSWORD);
    const token = await changePassword();
    const response = await recover(token);
    expect(response.statusCode).toBe(204);
    expect(cookieOf(response, 'lk_session').value).toBe('');
    expect(await me(ana)).toBeNull();
    expect(await me(phone)).toBeNull();
    expect((await login('ana@mesa.com', NEW_PASSWORD)).statusCode).toBe(200);
    expect((await login('ana@mesa.com', 'senha-do-invasor')).statusCode).toBe(401);
    expect((await recover(token)).statusCode).toBe(404);
  });

  it('revert-email-change: the old address signs in again and the new one no longer does', async () => {
    const token = await changeEmail('ana@mesa.com', 'invasor@x.com', PASSWORD, ana);
    expect((await recover(token)).statusCode).toBe(204);
    expect((await login('ana@mesa.com', NEW_PASSWORD)).statusCode).toBe(200);
    expect((await login('invasor@x.com', NEW_PASSWORD)).statusCode).toBe(401);
  });

  it('cancel-email-change: the confirmation link of the request dies', async () => {
    await post('/api/account/email', { newEmail: 'invasor@x.com', currentPassword: PASSWORD }, ana);
    const confirmation = mailer.confirmationTokenFor('invasor@x.com');
    const check = await post('/api/account/recovery/check', {
      token: mailer.recoveryTokenFor('ana@mesa.com'),
    });
    expect(accountRecoveryCheckResponseDto.parse(check.json()).recovery).toEqual({
      kind: 'cancel-email-change',
      email: 'i******@x.com',
    });
    await recover(mailer.recoveryTokenFor('ana@mesa.com'));
    const late = await post('/api/account/email/confirm', { token: confirmation });
    expect(late.statusCode).toBe(404);
  });

  it("the owner's link wins: A→B then B→C, using A's link brings A back and kills B's", async () => {
    const linkA = await changeEmail('ana@mesa.com', 'b@x.com', PASSWORD, ana);
    const linkB = await changeEmail('b@x.com', 'c@x.com', PASSWORD, ana);
    expect((await recover(linkA)).statusCode).toBe(204);
    expect((await login('ana@mesa.com', NEW_PASSWORD)).statusCode).toBe(200);
    expect((await recover(linkB)).statusCode).toBe(404);
  });

  it('a link past its 7 days is 404', async () => {
    const token = await changePassword();
    clock.current = new Date(clock.current.getTime() + SEVEN_DAYS_MS);
    expect((await recover(token)).statusCode).toBe(404);
  });

  it('the old address now owned by Bia is 409 and the password did not change (rolled back)', async () => {
    const token = await changeEmail('ana@mesa.com', 'nova@x.com', PASSWORD, ana);
    const bia = await logInAs(app, 'bia@mesa.com', PASSWORD);
    await changeEmail('bia@mesa.com', 'ana@mesa.com', PASSWORD, bia);
    const response = await recover(token);
    expect(response.statusCode).toBe(409);
    expect(apiErrorDto.parse(response.json()).code).toBe('EMAIL_TAKEN');
    expect((await login('nova@x.com', PASSWORD)).statusCode).toBe(200);
    expect((await post('/api/account/recovery/check', { token })).statusCode).toBe(200);
  });

  it("Ana's link never signs Bia out", async () => {
    const bia = await logInAs(app, 'bia@mesa.com', PASSWORD);
    await recover(await changePassword());
    expect(await me(bia)).not.toBeNull();
  });

  it('with 2FA on, the login after the recovery still asks for the code', async () => {
    const setup = await post('/api/account/two-factor/setup', { currentPassword: PASSWORD }, ana);
    const { secret } = setup.json() as { secret: string };
    await post('/api/account/two-factor/enable', { code: totpCodeAt(secret, clock.now()) }, ana);
    await recover(await changePassword());
    const signIn = await login('ana@mesa.com', NEW_PASSWORD);
    expect(signIn.json()).toEqual({ status: 'two-factor-required' });
  });

  it('a password under 8 characters is 400 and the link still works', async () => {
    const token = await changePassword();
    expect((await recover(token, '1234567')).statusCode).toBe(400);
    expect((await recover(token)).statusCode).toBe(204);
  });
});

describe('account recovery limit', () => {
  it('the 11th attempt in a minute from one IP is 429', async () => {
    const connection = await openTestDatabase();
    const env = { ...readEnv(process.env), adminSeed: null };
    const app = await buildApp({ env, db: connection.db, mailer: new MailerFake() });
    try {
      const attempt = () =>
        accountRequest(app, {
          method: 'POST',
          url: '/api/account/recovery/check',
          payload: { token: 'inventado' },
        });
      for (let index = 0; index < 10; index += 1) await attempt();
      expect((await attempt()).statusCode).toBe(429);
    } finally {
      await app.close();
      await connection.close();
    }
  });
});
