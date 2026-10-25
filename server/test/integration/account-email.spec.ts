import {
  accountSecurityResponseDto,
  apiErrorDto,
  changeEmailResponseDto,
} from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { MailerFake } from '../support/account-security-fakes';
import { accountRequest, logInAs } from '../support/account-security-http';
import { ClockFake } from '../support/auth-fakes';
import { insertTestAccount } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const PASSWORD = 'senha-da-ana';
const APP_PUBLIC_URL = 'https://mesa.example.com';
const THIRTY_ONE_MINUTES_MS = 31 * 60 * 1000;

describe('e-mail change', () => {
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

  function askChange(newEmail: string, currentPassword = PASSWORD) {
    return accountRequest(app, {
      method: 'POST',
      url: '/api/account/email',
      token: ana,
      payload: { newEmail, currentPassword },
    });
  }

  function confirm(token: string) {
    return accountRequest(app, {
      method: 'POST',
      url: '/api/account/email/confirm',
      payload: { token },
    });
  }

  function login(email: string) {
    return accountRequest(app, {
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: email, password: PASSWORD },
    });
  }

  it('the request answers 202 with the new address masked and mails the link to it', async () => {
    const response = await askChange('bianca@x.com');
    expect(response.statusCode).toBe(202);
    expect(changeEmailResponseDto.parse(response.json())).toEqual({ pendingEmail: 'b*****@x.com' });
    const [link] = mailer.to('bianca@x.com');
    expect(link?.text).toContain(`${APP_PUBLIC_URL}/account/email/confirm#token=`);
  });

  it('the old address is told about the request', async () => {
    await askChange('bianca@x.com');
    expect(mailer.to('ana@mesa.com').map((mail) => mail.subject)).toEqual([
      'Pediram para trocar o e-mail da sua conta',
    ]);
  });

  it('GET /account/security shows the pending change masked', async () => {
    await askChange('bianca@x.com');
    const response = await accountRequest(app, {
      method: 'GET',
      url: '/api/account/security',
      token: ana,
    });
    expect(accountSecurityResponseDto.parse(response.json()).security.pendingEmail).toBe(
      'b*****@x.com',
    );
  });

  it('the link confirms without a session (204) and the login moves to the new address', async () => {
    await askChange('bianca@x.com');
    const response = await confirm(mailer.confirmationTokenFor('bianca@x.com'));
    expect(response.statusCode).toBe(204);
    expect((await login('bianca@x.com')).statusCode).toBe(200);
    expect((await login('ana@mesa.com')).statusCode).toBe(401);
  });

  it('the same link a second time is 404 EMAIL_TOKEN_INVALID', async () => {
    await askChange('bianca@x.com');
    const token = mailer.confirmationTokenFor('bianca@x.com');
    await confirm(token);
    const again = await confirm(token);
    expect(again.statusCode).toBe(404);
    expect(apiErrorDto.parse(again.json()).code).toBe('EMAIL_TOKEN_INVALID');
  });

  it('a link past its 30 minutes is 404 and the e-mail stays', async () => {
    await askChange('bianca@x.com');
    clock.current = new Date(clock.current.getTime() + THIRTY_ONE_MINUTES_MS);
    const response = await confirm(mailer.confirmationTokenFor('bianca@x.com'));
    expect(response.statusCode).toBe(404);
    expect((await login('ana@mesa.com')).statusCode).toBe(200);
  });

  it('an address taken between the request and the click is 409 EMAIL_TAKEN', async () => {
    await askChange('bianca@x.com');
    await insertTestAccount(connection.db, {
      name: 'Bianca',
      email: 'bianca@x.com',
      password: PASSWORD,
    });
    const response = await confirm(mailer.confirmationTokenFor('bianca@x.com'));
    expect(response.statusCode).toBe(409);
    expect(apiErrorDto.parse(response.json()).code).toBe('EMAIL_TAKEN');
  });

  it('cancelling kills the link', async () => {
    await askChange('bianca@x.com');
    const cancel = await accountRequest(app, {
      method: 'DELETE',
      url: '/api/account/email',
      token: ana,
    });
    expect(cancel.statusCode).toBe(204);
    expect((await confirm(mailer.confirmationTokenFor('bianca@x.com'))).statusCode).toBe(404);
  });

  it('an address already in use is 409 EMAIL_TAKEN at the request', async () => {
    const response = await askChange('bia@mesa.com');
    expect(response.statusCode).toBe(409);
    expect(apiErrorDto.parse(response.json()).code).toBe('EMAIL_TAKEN');
  });

  it('the current address is 400 EMAIL_UNCHANGED', async () => {
    const response = await askChange('ana@mesa.com');
    expect(response.statusCode).toBe(400);
    expect(apiErrorDto.parse(response.json()).code).toBe('EMAIL_UNCHANGED');
  });

  it('a wrong password is 403 CURRENT_PASSWORD_INVALID and nothing is mailed', async () => {
    const response = await askChange('bianca@x.com', 'errada');
    expect(response.statusCode).toBe(403);
    expect(mailer.sent).toEqual([]);
  });

  it('the 4th request in 10 minutes is 429', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) await askChange(`ana${attempt}@novo.com`);
    expect((await askChange('ana9@novo.com')).statusCode).toBe(429);
  });

  it('the confirm is limited per IP: the 11th in a minute is 429', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) await confirm(`forjado-${attempt}`);
    expect((await confirm('forjado-final')).statusCode).toBe(429);
  });
});
