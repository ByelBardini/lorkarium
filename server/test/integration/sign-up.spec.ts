import {
  acceptInvitationResponseDto,
  apiErrorDto,
  invitationInspectResponseDto,
  LEGAL_DOCUMENTS_VERSION,
  signUpSettingsDto,
} from '@lorkarium/contracts';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv } from '../../src/config/env';
import type { SignUpConfig } from '../../src/config/sign-up-env';
import type { DatabaseConnection } from '../../src/database/database';
import { users } from '../../src/modules/auth/users.po';
import { emailIndexOf } from '../../src/modules/auth/auth.mapper';
import { AesGcmDataCipher } from '../../src/infrastructure/data-cipher/aes-gcm-data-cipher';
import { invitations } from '../../src/modules/account-links/invitations.po';
import { HumanCheckFake } from '../support/account-links-fakes';
import { MailerFake } from '../support/account-security-fakes';
import { ClockFake } from '../support/auth-fakes';
import { insertTestAccount } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const APP_PUBLIC_URL = 'https://mesa.example.com';
const OPEN: SignUpConfig = {
  registrationOpen: true,
  humanCheck: { siteKey: '1x00000000000000000000AA', secretKey: 'unused-the-fake-checks' },
};
const MARINA = 'marina@exemplo.com';
const SIGN_UP_LINK = /\/sign-up\/confirm#token=([^\s"<]+)/;

describe('public sign-up', () => {
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let mailer: MailerFake;
  let humanCheck: HumanCheckFake;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  async function start(signUp: SignUpConfig = OPEN): Promise<void> {
    const env = { ...readEnv(process.env), adminSeed: null, appPublicUrl: APP_PUBLIC_URL, signUp };
    app = await buildApp({
      env,
      db: connection.db,
      mailer,
      humanCheck,
      clock: new ClockFake(new Date()),
    });
  }

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    mailer = new MailerFake();
    humanCheck = new HumanCheckFake();
    await start();
  });

  afterEach(() => app.close());

  function signUp(email: string, extra: object = {}): Promise<LightMyRequestResponse> {
    return app.inject({
      method: 'POST',
      url: '/api/sign-up',
      payload: { email, humanCheckToken: 'tok', ...extra },
    });
  }

  function expectSilentAccept(response: LightMyRequestResponse): void {
    expect(response.statusCode).toBe(202);
    expect(response.body).toBe('');
  }

  async function invitationCount(): Promise<number> {
    const { rows } = await connection.db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM ${invitations}`,
    );
    return rows[0]?.n ?? -1;
  }

  it('the settings are public and follow the env', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/sign-up/settings' });
    expect(response.statusCode).toBe(200);
    expect(signUpSettingsDto.parse(response.json())).toEqual({
      registrationOpen: true,
      humanCheckSiteKey: '1x00000000000000000000AA',
    });
  });

  it('closed and without keys, the settings say so', async () => {
    await app.close();
    await start({ registrationOpen: false, humanCheck: null });
    const response = await app.inject({ method: 'GET', url: '/api/sign-up/settings' });
    expect(response.json()).toEqual({ registrationOpen: false, humanCheckSiteKey: null });
  });

  it('a new address: 202, a link to /sign-up/confirm that inspects as self and becomes a user', async () => {
    expectSilentAccept(await signUp('Marina@Exemplo.com'));
    const token = mailer.lastTokenFor(MARINA, SIGN_UP_LINK);
    const inspect = await app.inject({
      method: 'POST',
      url: '/api/invitations/inspect',
      payload: { token },
    });
    expect(invitationInspectResponseDto.parse(inspect.json())).toMatchObject({
      email: MARINA,
      origin: 'self',
    });
    const accept = await app.inject({
      method: 'POST',
      url: '/api/invitations/accept',
      payload: {
        token,
        username: 'marina',
        password: 'senha-da-marina',
        persistent: false,
        acceptedTerms: true,
      },
    });
    expect(acceptInvitationResponseDto.parse(accept.json()).user).toMatchObject({
      username: 'marina',
      role: 'user',
    });
    expect(accept.cookies.some((cookie) => cookie.name === 'lk_session')).toBe(true);
    const [row] = await connection.db
      .select({ version: users.termsVersion })
      .from(users)
      .where(eq(users.username, 'marina'));
    expect(row?.version).toBe(LEGAL_DOCUMENTS_VERSION);
  });

  it('the address of an account gets the same 202 and the "you already have an account" e-mail', async () => {
    await insertTestAccount(connection.db, {
      name: 'Ana',
      email: 'ana@mesa.com',
      password: 'senha-de-teste',
    });
    expectSilentAccept(await signUp('ana@mesa.com'));
    expect(mailer.to('ana@mesa.com').map((mail) => mail.subject)).toEqual([
      'Você já tem uma conta no Lorkarium',
    ]);
    expect(mailer.lastTokenFor('ana@mesa.com', /\/reset-password#token=([^\s"<]+)/)).not.toBe('');
    expect(await invitationCount()).toBe(0);
  });

  it('a banned address gets the same 202 and no e-mail', async () => {
    const cipher = new AesGcmDataCipher(readEnv(process.env).dataEncryptionKey);
    await connection.db.execute(sql`
      INSERT INTO banned_email_indexes (email_index, banned_at) VALUES (${emailIndexOf(cipher, MARINA)}, now())`);
    expectSilentAccept(await signUp(MARINA));
    expect(mailer.sent).toEqual([]);
    expect(await invitationCount()).toBe(0);
  });

  it('a second request within 2 minutes gets the same 202 and only one e-mail leaves', async () => {
    expectSilentAccept(await signUp(MARINA));
    expectSilentAccept(await signUp(MARINA));
    expect(mailer.to(MARINA)).toHaveLength(1);
  });

  it('closed, it is 403 REGISTRATION_CLOSED without asking the anti-bot check', async () => {
    await app.close();
    await start({ ...OPEN, registrationOpen: false });
    const response = await signUp(MARINA);
    expect(response.statusCode).toBe(403);
    expect(apiErrorDto.parse(response.json()).code).toBe('REGISTRATION_CLOSED');
    expect(humanCheck.checked).toEqual([]);
  });

  it('a refused anti-bot token is 400 HUMAN_CHECK_FAILED and the IP went with it', async () => {
    humanCheck.passes = false;
    const response = await signUp(MARINA);
    expect(response.statusCode).toBe(400);
    expect(apiErrorDto.parse(response.json()).code).toBe('HUMAN_CHECK_FAILED');
    expect(humanCheck.checked).toEqual([{ token: 'tok', remoteIp: '127.0.0.1' }]);
    expect(await invitationCount()).toBe(0);
  });

  it.each([
    ['an invalid address', { email: 'nao-e-email' }],
    ['no token', { email: MARINA, humanCheckToken: '' }],
    ['an extra field', { email: MARINA, role: 'admin' }],
  ])('%s is 400 INVALID_BODY', async (_case, payload) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/sign-up',
      payload: { humanCheckToken: 'tok', ...payload },
    });
    expect(response.statusCode).toBe(400);
    expect(apiErrorDto.parse(response.json()).code).toBe('INVALID_BODY');
  });

  it('the 6th request of an IP in 10 minutes is 429 with Retry-After', async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expectSilentAccept(await signUp(`pessoa${attempt}@exemplo.com`));
    }
    const response = await signUp('pessoa6@exemplo.com');
    expect(response.statusCode).toBe(429);
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    const body = apiErrorDto.parse(response.json());
    expect(body.code).toBe('RATE_LIMITED');
    expect(body.retryAfterSeconds).toBeGreaterThan(500);
  });
});
