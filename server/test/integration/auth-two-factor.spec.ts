import {
  accountSecurityResponseDto,
  apiErrorDto,
  loginResponseDto,
  meResponseDto,
  recoveryCodesResponseDto,
  twoFactorSetupResponseDto,
} from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { twoFactorChallenges } from '../../src/modules/auth/two-factor-challenges.po';
import { users } from '../../src/modules/auth/users.po';
import { MailerFake } from '../support/account-security-fakes';
import { accountRequest, cookieOf, logInAs, totpCodeAt } from '../support/account-security-http';
import { ClockFake } from '../support/auth-fakes';
import { insertTestAccount } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const PASSWORD = 'senha-de-teste';
const STEP_MS = 30_000;

describe('login in two steps', () => {
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let clock: ClockFake;
  let secret: string;
  let recoveryCodes: string[];

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
    clock = new ClockFake(new Date());
    const env = { ...readEnv(process.env), adminSeed: null };
    app = await buildApp({ env, db: connection.db, mailer: new MailerFake(), clock });
    ({ secret, recoveryCodes } = await turnOnTwoFactorOfAna());
    nextStep();
  });

  afterEach(() => app.close());

  function nextStep(): void {
    clock.current = new Date(clock.current.getTime() + STEP_MS);
  }

  async function turnOnTwoFactorOfAna(): Promise<{ secret: string; recoveryCodes: string[] }> {
    const token = await logInAs(app, 'ana@mesa.com', PASSWORD);
    const url = '/api/account/two-factor';
    const setup = await accountRequest(app, {
      method: 'POST',
      url: `${url}/setup`,
      token,
      payload: { currentPassword: PASSWORD },
    });
    const { secret: drawn } = twoFactorSetupResponseDto.parse(setup.json());
    const enable = await accountRequest(app, {
      method: 'POST',
      url: `${url}/enable`,
      token,
      payload: { code: totpCodeAt(drawn, clock.now()) },
    });
    return {
      secret: drawn,
      recoveryCodes: recoveryCodesResponseDto.parse(enable.json()).recoveryCodes,
    };
  }

  function login(email: string, rememberMe = false): Promise<LightMyRequestResponse> {
    return accountRequest(app, {
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: email, password: PASSWORD, rememberMe },
    });
  }

  function secondStep(
    challenge: string | undefined,
    payload: object,
  ): Promise<LightMyRequestResponse> {
    return app.inject({
      method: 'POST',
      url: '/api/auth/login/two-factor',
      cookies: challenge ? { lk_2fa: challenge } : {},
      payload,
    });
  }

  async function challengeCount(): Promise<number> {
    const rows = await connection.db.select().from(twoFactorChallenges);
    return rows.length;
  }

  async function challengeOfAna(rememberMe = false): Promise<string> {
    return cookieOf(await login('ana@mesa.com', rememberMe), 'lk_2fa').value;
  }

  it('an account suspended between the password and the code is refused with 403 at the second step', async () => {
    const challenge = await challengeOfAna();
    await connection.db
      .update(users)
      .set({ suspendedAt: new Date() })
      .where(eq(users.username, 'ana'));
    const response = await secondStep(challenge, { code: totpCodeAt(secret, clock.now()) });
    expect(response.statusCode).toBe(403);
    expect(apiErrorDto.parse(response.json()).code).toBe('ACCOUNT_SUSPENDED');
  });

  it('without 2FA the login is unchanged: signed-in with lk_session and no lk_2fa', async () => {
    const response = await login('bia@mesa.com');
    expect(loginResponseDto.parse(response.json()).status).toBe('signed-in');
    expect(cookieOf(response, 'lk_session').value).not.toBe('');
    expect(response.cookies.some((cookie) => cookie.name === 'lk_2fa')).toBe(false);
  });

  it('with 2FA the password answers two-factor-required and a 5-minute HttpOnly lk_2fa on /api/auth', async () => {
    const response = await login('ana@mesa.com');
    expect(response.statusCode).toBe(200);
    expect(loginResponseDto.parse(response.json())).toEqual({ status: 'two-factor-required' });
    expect(cookieOf(response, 'lk_2fa')).toMatchObject({
      httpOnly: true,
      path: '/api/auth',
      maxAge: 300,
      sameSite: 'Lax',
    });
    expect(response.cookies.some((cookie) => cookie.name === 'lk_session')).toBe(false);
  });

  it('after the first step /me is still anonymous', async () => {
    await challengeOfAna();
    const me = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(meResponseDto.parse(me.json())).toEqual({ user: null });
  });

  it('the right code signs in: lk_session set and lk_2fa expired', async () => {
    const challenge = await challengeOfAna();
    const response = await secondStep(challenge, { code: totpCodeAt(secret, clock.now()) });
    expect(response.statusCode).toBe(200);
    expect(loginResponseDto.parse(response.json())).toMatchObject({
      status: 'signed-in',
      user: { email: 'ana@mesa.com' },
    });
    const session = cookieOf(response, 'lk_session').value;
    const cleared = cookieOf(response, 'lk_2fa');
    expect(cleared.value).toBe('');
    const me = await accountRequest(app, { method: 'GET', url: '/api/auth/me', token: session });
    expect(meResponseDto.parse(me.json()).user?.email).toBe('ana@mesa.com');
  });

  it('"keep me signed in" of the first step makes the session persistent', async () => {
    const challenge = await challengeOfAna(true);
    const response = await secondStep(challenge, { code: totpCodeAt(secret, clock.now()) });
    expect(cookieOf(response, 'lk_session').maxAge).toBe(2_592_000);
  });

  it('a wrong code is 401 TWO_FACTOR_CODE_INVALID and gives no session', async () => {
    const response = await secondStep(await challengeOfAna(), { code: '000000' });
    expect(response.statusCode).toBe(401);
    expect(apiErrorDto.parse(response.json()).code).toBe('TWO_FACTOR_CODE_INVALID');
    expect(response.cookies.some((cookie) => cookie.name === 'lk_session')).toBe(false);
  });

  it('without the challenge cookie it is 401 TWO_FACTOR_CHALLENGE_EXPIRED', async () => {
    const response = await secondStep(undefined, { code: totpCodeAt(secret, clock.now()) });
    expect(response.statusCode).toBe(401);
    expect(apiErrorDto.parse(response.json()).code).toBe('TWO_FACTOR_CHALLENGE_EXPIRED');
  });

  it('a challenge past its 5 minutes is 401 TWO_FACTOR_CHALLENGE_EXPIRED', async () => {
    const challenge = await challengeOfAna();
    clock.current = new Date(clock.current.getTime() + 5 * 60 * 1000);
    const response = await secondStep(challenge, { code: totpCodeAt(secret, clock.now()) });
    expect(apiErrorDto.parse(response.json()).code).toBe('TWO_FACTOR_CHALLENGE_EXPIRED');
  });

  it("a code of another secret does not serve Ana's challenge", async () => {
    const foreign = totpCodeAt('JBSWY3DPEHPK3PXP', clock.now());
    const response = await secondStep(await challengeOfAna(), { code: foreign });
    expect(response.statusCode).toBe(401);
    expect(apiErrorDto.parse(response.json()).code).toBe('TWO_FACTOR_CODE_INVALID');
  });

  it('the same code twice: the second login is refused (replay)', async () => {
    const code = totpCodeAt(secret, clock.now());
    expect((await secondStep(await challengeOfAna(), { code })).statusCode).toBe(200);
    const again = await secondStep(await challengeOfAna(), { code });
    expect(apiErrorDto.parse(again.json()).code).toBe('TWO_FACTOR_CODE_INVALID');
  });

  it('a recovery code signs in once, and the section counts one less', async () => {
    const [code] = recoveryCodes;
    const response = await secondStep(await challengeOfAna(), { recoveryCode: code });
    expect(response.statusCode).toBe(200);
    const session = cookieOf(response, 'lk_session').value;
    const security = await accountRequest(app, {
      method: 'GET',
      url: '/api/account/security',
      token: session,
    });
    expect(
      accountSecurityResponseDto.parse(security.json()).security.twoFactor.recoveryCodesLeft,
    ).toBe(9);
    const again = await secondStep(await challengeOfAna(), { recoveryCode: code });
    expect(again.statusCode).toBe(401);
  });

  // The 6th try is already 429 by the limiter, so the deletion is read from the table.
  it('the 5th wrong code deletes the challenge', async () => {
    const challenge = await challengeOfAna();
    for (let attempt = 0; attempt < 4; attempt += 1)
      await secondStep(challenge, { code: '000000' });
    expect(await challengeCount()).toBe(1);
    await secondStep(challenge, { code: '000000' });
    expect(await challengeCount()).toBe(0);
  });

  it('a body with both a code and a recovery code is 400', async () => {
    const response = await secondStep(await challengeOfAna(), {
      code: '123456',
      recoveryCode: 'aaaaa-bbbbb',
    });
    expect(response.statusCode).toBe(400);
  });

  it('the 6th try in a minute is 429', async () => {
    const challenge = await challengeOfAna();
    for (let attempt = 0; attempt < 5; attempt += 1)
      await secondStep(challenge, { code: '000000' });
    expect((await secondStep(challenge, { code: '000000' })).statusCode).toBe(429);
  });
});
