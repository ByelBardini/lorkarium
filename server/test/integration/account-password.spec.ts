import { accountSecurityResponseDto, apiErrorDto } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { MailerFake } from '../support/account-security-fakes';
import { accountRequest, logInAs } from '../support/account-security-http';
import { insertTestAccount } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const OLD_PASSWORD = 'senha-velha';
const NEW_PASSWORD = 'senha-nova-123';

describe('password change and the security section', () => {
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let mailer: MailerFake;
  let current: string;
  let other: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const account = { name: 'Ana', email: 'ana@mesa.com', password: OLD_PASSWORD };
    await insertTestAccount(connection.db, account);
    mailer = new MailerFake();
    const env = { ...readEnv(process.env), adminSeed: null };
    app = await buildApp({ env, db: connection.db, mailer });
    current = await logInAs(app, 'ana@mesa.com', OLD_PASSWORD);
    other = await logInAs(app, 'ana@mesa.com', OLD_PASSWORD);
  });

  afterEach(() => app.close());

  function changePassword(token: string, currentPassword: string, newPassword = NEW_PASSWORD) {
    return accountRequest(app, {
      method: 'POST',
      url: '/api/account/password',
      token,
      payload: { currentPassword, newPassword },
    });
  }

  function login(password: string) {
    return accountRequest(app, {
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'ana@mesa.com', password },
    });
  }

  function me(token: string) {
    return accountRequest(app, { method: 'GET', url: '/api/account/security', token });
  }

  it('the change answers 204: the other session gets 401 and the current one goes on', async () => {
    expect((await changePassword(current, OLD_PASSWORD)).statusCode).toBe(204);
    expect((await me(other)).statusCode).toBe(401);
    expect((await me(current)).statusCode).toBe(200);
  });

  it('after it the old password is refused at login and the new one signs in', async () => {
    await changePassword(current, OLD_PASSWORD);
    expect((await login(OLD_PASSWORD)).statusCode).toBe(401);
    expect((await login(NEW_PASSWORD)).statusCode).toBe(200);
  });

  it('a wrong current password is 403 CURRENT_PASSWORD_INVALID (never 401) and changes nothing', async () => {
    const response = await changePassword(current, 'errada');
    expect(response.statusCode).toBe(403);
    expect(apiErrorDto.parse(response.json()).code).toBe('CURRENT_PASSWORD_INVALID');
    expect((await me(other)).statusCode).toBe(200);
    expect((await login(OLD_PASSWORD)).statusCode).toBe(200);
  });

  it('a new password of 7 characters is 400 INVALID_BODY', async () => {
    const response = await changePassword(current, OLD_PASSWORD, '1234567');
    expect(response.statusCode).toBe(400);
    expect(apiErrorDto.parse(response.json()).code).toBe('INVALID_BODY');
  });

  it('without a session it is 401', async () => {
    const response = await accountRequest(app, {
      method: 'POST',
      url: '/api/account/password',
      payload: { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD },
    });
    expect(response.statusCode).toBe(401);
  });

  it('the 6th request in a minute is 429 with Retry-After', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) await changePassword(current, 'errada');
    const response = await changePassword(current, 'errada');
    expect(response.statusCode).toBe(429);
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    expect(apiErrorDto.parse(response.json())).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('GET /account/security says when the password changed', async () => {
    const before = accountSecurityResponseDto.parse((await me(current)).json());
    expect(before.security).toEqual({
      email: 'ana@mesa.com',
      passwordChangedAt: null,
      pendingEmail: null,
      twoFactor: { enabled: false, recoveryCodesLeft: 0 },
    });
    await changePassword(current, OLD_PASSWORD);
    const after = accountSecurityResponseDto.parse((await me(current)).json());
    expect(after.security.passwordChangedAt).not.toBeNull();
  });

  it('the change sends "Sua senha do Lorkarium foi trocada" to the e-mail of Ana', async () => {
    await changePassword(current, OLD_PASSWORD);
    expect(mailer.sent.map((mail) => [mail.to, mail.subject])).toEqual([
      ['ana@mesa.com', 'Sua senha do Lorkarium foi trocada'],
    ]);
  });
});
