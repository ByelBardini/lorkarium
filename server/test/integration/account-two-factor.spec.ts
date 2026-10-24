import {
  accountSecurityResponseDto,
  apiErrorDto,
  recoveryCodesResponseDto,
  twoFactorSetupResponseDto,
  type TwoFactorSetupResponseDto,
} from '@lorkarium/contracts';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { MailerFake } from '../support/account-security-fakes';
import { accountRequest, logInAs, totpCodeAt } from '../support/account-security-http';
import { ClockFake } from '../support/auth-fakes';
import { insertTestAccount } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const PASSWORD = 'senha-da-ana';
const STEP_MS = 30_000;

describe('2FA on the account', () => {
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
    mailer = new MailerFake();
    clock = new ClockFake(new Date());
    const env = { ...readEnv(process.env), adminSeed: null };
    app = await buildApp({ env, db: connection.db, mailer, clock });
    ana = await logInAs(app, 'ana@mesa.com', PASSWORD);
  });

  afterEach(() => app.close());

  function post(url: string, payload: object) {
    return accountRequest(app, {
      method: 'POST',
      url: `/api/account/two-factor/${url}`,
      token: ana,
      payload,
    });
  }

  function nextStep(): void {
    clock.current = new Date(clock.current.getTime() + STEP_MS);
  }

  async function setUp(): Promise<TwoFactorSetupResponseDto> {
    const response = await post('setup', { currentPassword: PASSWORD });
    return twoFactorSetupResponseDto.parse(response.json());
  }

  async function turnOn(): Promise<{ secret: string; codes: string[] }> {
    const { secret } = await setUp();
    const response = await post('enable', { code: totpCodeAt(secret, clock.now()) });
    return { secret, codes: recoveryCodesResponseDto.parse(response.json()).recoveryCodes };
  }

  async function security() {
    const response = await accountRequest(app, {
      method: 'GET',
      url: '/api/account/security',
      token: ana,
    });
    return accountSecurityResponseDto.parse(response.json()).security;
  }

  it('setup answers the secret, the otpauth URI with the @ and a PNG QR', async () => {
    const setup = await setUp();
    expect(setup.otpauthUri).toContain('issuer=Lorkarium');
    expect(setup.otpauthUri).toContain('ana');
    expect(setup.qrImage.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('the row in the database never holds the secret in base32', async () => {
    const { secret } = await setUp();
    const rows = await connection.db.execute(sql`SELECT * FROM user_two_factor`);
    expect(JSON.stringify(rows.rows)).not.toContain(secret);
  });

  it('the full cycle: a code from the secret turns it on with 10 codes, shown in the section', async () => {
    const { codes } = await turnOn();
    expect(codes).toHaveLength(10);
    expect((await security()).twoFactor).toEqual({ enabled: true, recoveryCodesLeft: 10 });
    expect(mailer.sent.map((mail) => mail.subject)).toContain('Verificação em duas etapas ligada');
  });

  it('a wrong code at enable is 403 TWO_FACTOR_CODE_INVALID and 2FA stays off', async () => {
    await setUp();
    const response = await post('enable', { code: '000000' });
    expect(response.statusCode).toBe(403);
    expect(apiErrorDto.parse(response.json()).code).toBe('TWO_FACTOR_CODE_INVALID');
    expect((await security()).twoFactor.enabled).toBe(false);
  });

  it('enable without setup is 409 TWO_FACTOR_NOT_STARTED', async () => {
    const response = await post('enable', { code: '123456' });
    expect(response.statusCode).toBe(409);
    expect(apiErrorDto.parse(response.json()).code).toBe('TWO_FACTOR_NOT_STARTED');
  });

  it('setup with 2FA on is 409 TWO_FACTOR_ALREADY_ENABLED', async () => {
    await turnOn();
    const response = await post('setup', { currentPassword: PASSWORD });
    expect(response.statusCode).toBe(409);
    expect(apiErrorDto.parse(response.json()).code).toBe('TWO_FACTOR_ALREADY_ENABLED');
  });

  it('setup with a wrong password is 403 CURRENT_PASSWORD_INVALID', async () => {
    const response = await post('setup', { currentPassword: 'errada' });
    expect(response.statusCode).toBe(403);
    expect(apiErrorDto.parse(response.json()).code).toBe('CURRENT_PASSWORD_INVALID');
  });

  it('regenerating gives new codes; an old one no longer serves and the count is back to 10', async () => {
    const { secret, codes } = await turnOn();
    nextStep();
    const regenerated = await post('recovery-codes', {
      currentPassword: PASSWORD,
      code: totpCodeAt(secret, clock.now()),
    });
    expect(regenerated.statusCode).toBe(200);
    const fresh = recoveryCodesResponseDto.parse(regenerated.json()).recoveryCodes;
    expect(fresh).not.toContain(codes[0]);
    const withOld = await post('disable', { currentPassword: PASSWORD, code: codes[0] });
    expect(withOld.statusCode).toBe(403);
    expect((await security()).twoFactor.recoveryCodesLeft).toBe(10);
  });

  it('a recovery code also confirms the regeneration, and it is not among the new ones', async () => {
    const { codes } = await turnOn();
    const response = await post('recovery-codes', { currentPassword: PASSWORD, code: codes[0] });
    expect(response.statusCode).toBe(200);
    expect(recoveryCodesResponseDto.parse(response.json()).recoveryCodes).not.toContain(codes[0]);
  });

  it('disable with password + a fresh code turns it off', async () => {
    const { secret } = await turnOn();
    nextStep();
    const response = await post('disable', {
      currentPassword: PASSWORD,
      code: totpCodeAt(secret, clock.now()),
    });
    expect(response.statusCode).toBe(204);
    expect((await security()).twoFactor).toEqual({ enabled: false, recoveryCodesLeft: 0 });
  });

  it('the code that turned it on cannot turn it off (replay)', async () => {
    const { secret } = await turnOn();
    const response = await post('disable', {
      currentPassword: PASSWORD,
      code: totpCodeAt(secret, clock.now()),
    });
    expect(response.statusCode).toBe(403);
    expect((await security()).twoFactor.enabled).toBe(true);
  });

  it('disable with 2FA off is 409 TWO_FACTOR_NOT_ENABLED', async () => {
    const response = await post('disable', { currentPassword: PASSWORD, code: '123456' });
    expect(response.statusCode).toBe(409);
    expect(apiErrorDto.parse(response.json()).code).toBe('TWO_FACTOR_NOT_ENABLED');
  });

  it('the 6th wrong code in a minute is 429', async () => {
    await setUp();
    for (let attempt = 0; attempt < 4; attempt += 1) await post('enable', { code: '000000' });
    expect((await post('enable', { code: '000000' })).statusCode).toBe(403);
    expect((await post('enable', { code: '000000' })).statusCode).toBe(429);
  });

  it('without a session it is 401', async () => {
    const response = await accountRequest(app, {
      method: 'POST',
      url: '/api/account/two-factor/setup',
      payload: { currentPassword: PASSWORD },
    });
    expect(response.statusCode).toBe(401);
  });
});
