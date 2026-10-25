import { apiErrorDto, loginResponseDto, meResponseDto } from '@lorkarium/contracts';
import { memberColorOf } from '@lorkarium/game-core';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { authSessions } from '../../src/modules/auth/auth-sessions.po';
import { users, type UserPo } from '../../src/modules/auth/users.po';
import { insertTestAccount, testDataCipher } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const ADMIN_SEED = { email: 'root@lorkarium.dev', password: 'root-password-123' };

describe('auth HTTP edge', () => {
  const env: Env = { ...readEnv(process.env), adminSeed: null };
  let connection: DatabaseConnection;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  async function freshApp(overrides: Partial<Env> = {}): Promise<FastifyInstance> {
    return buildApp({ env: { ...env, ...overrides }, db: connection.db });
  }

  async function insertAccount(email: string, password: string): Promise<UserPo> {
    return insertTestAccount(connection.db, { name: 'Ana', email, password });
  }

  function login(app: FastifyInstance, payload: object): Promise<LightMyRequestResponse> {
    return app.inject({ method: 'POST', url: '/api/auth/login', payload });
  }

  function sessionCookieOf(response: LightMyRequestResponse): string {
    const cookie = response.cookies.find((candidate) => candidate.name === 'lk_session');
    if (!cookie)
      throw new Error(`expected a lk_session cookie, got ${response.headers['set-cookie']}`);
    return cookie.value;
  }

  function me(app: FastifyInstance, token?: string): Promise<LightMyRequestResponse> {
    return app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: token ? { lk_session: token } : {},
    });
  }

  describe('POST /api/auth/login', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      await truncateAllTables(connection.db);
      await insertAccount('ana@mesa.com', 'segredo-da-ana');
      app = await freshApp();
    });

    afterAll(() => app.close());

    it('right credentials answer 200 signed-in with the user and an HttpOnly Lax session cookie without Max-Age', async () => {
      const response = await login(app, { identifier: 'Ana@Mesa.com', password: 'segredo-da-ana' });
      expect(response.statusCode).toBe(200);
      expect(loginResponseDto.parse(response.json())).toMatchObject({
        status: 'signed-in',
        user: { email: 'ana@mesa.com', username: 'ana', role: 'user' },
      });
      const setCookie = String(response.headers['set-cookie']);
      expect(setCookie).toMatch(/^lk_session=[\w-]+;/);
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Lax');
      expect(setCookie).toContain('Path=/');
      expect(setCookie).not.toContain('Max-Age');
    });

    it('rememberMe makes the cookie last 30 days', async () => {
      const response = await login(app, {
        identifier: 'ana@mesa.com',
        password: 'segredo-da-ana',
        rememberMe: true,
      });
      expect(String(response.headers['set-cookie'])).toContain('Max-Age=2592000');
    });

    it('a wrong password and an unknown e-mail answer 401 with the same body', async () => {
      const wrongPassword = await login(app, { identifier: 'ana@mesa.com', password: 'errada' });
      const unknownEmail = await login(app, { identifier: 'bia@mesa.com', password: 'errada' });
      expect(wrongPassword.statusCode).toBe(401);
      expect(unknownEmail.statusCode).toBe(401);
      expect(apiErrorDto.parse(wrongPassword.json()).code).toBe('INVALID_CREDENTIALS');
      expect(unknownEmail.json()).toEqual(wrongPassword.json());
    });

    it.each(['Ana', '@ana'])(
      'the @ "%s" signs in the same account as the e-mail',
      async (identifier) => {
        const response = await login(app, { identifier, password: 'segredo-da-ana' });
        expect(response.statusCode).toBe(200);
        expect(loginResponseDto.parse(response.json())).toMatchObject({
          status: 'signed-in',
          user: { email: 'ana@mesa.com', username: 'ana' },
        });
        expect(sessionCookieOf(response)).not.toBe('');
      },
    );

    it('a wrong password by @ and an unknown @ answer 401 with the body of the e-mail refusal', async () => {
      const byEmail = await login(app, { identifier: 'ana@mesa.com', password: 'errada' });
      const wrongPassword = await login(app, { identifier: 'ana', password: 'errada' });
      const unknownUsername = await login(app, { identifier: 'bia', password: 'errada' });
      expect([wrongPassword.statusCode, unknownUsername.statusCode]).toEqual([401, 401]);
      expect(wrongPassword.json()).toEqual(byEmail.json());
      expect(unknownUsername.json()).toEqual(byEmail.json());
    });

    it('a body carrying a forged role answers 400 and sets no cookie', async () => {
      const response = await login(app, {
        identifier: 'bia@mesa.com',
        password: 'x',
        role: 'admin',
      });
      expect(response.statusCode).toBe(400);
      expect(apiErrorDto.parse(response.json()).code).toBe('INVALID_BODY');
      expect(response.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('login rate limit', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      await truncateAllTables(connection.db);
      app = await freshApp();
    });

    afterAll(() => app.close());

    it('the 6th attempt for the same e-mail within a minute answers 429 with Retry-After', async () => {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        expect((await login(app, { identifier: 'alvo@mesa.com', password: 'x' })).statusCode).toBe(
          401,
        );
      }
      const blocked = await login(app, { identifier: 'alvo@mesa.com', password: 'x' });
      expect(blocked.statusCode).toBe(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect(apiErrorDto.parse(blocked.json())).toMatchObject({ code: 'RATE_LIMITED' });
    });

    it('the @ typed with "@" and in capitals spends the same bucket as the bare @', async () => {
      for (const identifier of ['alvo2', '@Alvo2', 'ALVO2', '@alvo2', 'alvo2']) {
        expect((await login(app, { identifier, password: 'x' })).statusCode).toBe(401);
      }
      expect((await login(app, { identifier: '@alvo2', password: 'x' })).statusCode).toBe(429);
    });
  });

  describe('GET /api/auth/me and POST /api/auth/logout', () => {
    let app: FastifyInstance;
    let token: string;

    beforeAll(async () => {
      await truncateAllTables(connection.db);
      await insertAccount('ana@mesa.com', 'segredo-da-ana');
      app = await freshApp();
    });

    afterAll(() => app.close());

    async function signIn(): Promise<string> {
      return sessionCookieOf(
        await login(app, { identifier: 'ana@mesa.com', password: 'segredo-da-ana' }),
      );
    }

    it('with the session cookie it answers the signed-in user with @, effective color and no photo', async () => {
      token = await signIn();
      const user = meResponseDto.parse((await me(app, token)).json()).user;
      expect(user).toMatchObject({ email: 'ana@mesa.com', username: 'ana', avatarId: null });
      expect(user?.color).toBe(memberColorOf(user?.id ?? '', null));
    });

    it('without a cookie it answers 200 with user null', async () => {
      const response = await me(app);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ user: null });
    });

    it('with a session expired in the database it answers user null', async () => {
      const expired = await signIn();
      await connection.db.update(authSessions).set({ expiresAt: new Date('2020-01-01T00:00:00Z') });
      expect((await me(app, expired)).json()).toEqual({ user: null });
    });

    it('logout answers 204 and the same cookie then resolves to user null', async () => {
      token = await signIn();
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        cookies: { lk_session: token },
      });
      expect(response.statusCode).toBe(204);
      expect((await me(app, token)).json()).toEqual({ user: null });
    });
  });

  describe('role guard', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      await truncateAllTables(connection.db);
      await insertAccount('ana@mesa.com', 'segredo-da-ana');
      app = await freshApp({ adminSeed: ADMIN_SEED });
      app.get(
        '/api/spec/admin-only',
        { preHandler: app.authGuards.requireRole('admin') },
        async () => ({
          reached: true,
        }),
      );
    });

    afterAll(() => app.close());

    async function adminOnlyAs(
      email: string | null,
      password = '',
    ): Promise<LightMyRequestResponse> {
      const cookies: Record<string, string> = email
        ? { lk_session: sessionCookieOf(await login(app, { identifier: email, password })) }
        : {};
      return app.inject({ method: 'GET', url: '/api/spec/admin-only', cookies });
    }

    it('without a session it answers 401 UNAUTHENTICATED', async () => {
      const response = await adminOnlyAs(null);
      expect(response.statusCode).toBe(401);
      expect(apiErrorDto.parse(response.json()).code).toBe('UNAUTHENTICATED');
    });

    it('a user answers 403 FORBIDDEN_ROLE', async () => {
      const response = await adminOnlyAs('ana@mesa.com', 'segredo-da-ana');
      expect(response.statusCode).toBe(403);
      expect(apiErrorDto.parse(response.json()).code).toBe('FORBIDDEN_ROLE');
    });

    it('the seeded admin answers 200', async () => {
      const response = await adminOnlyAs(ADMIN_SEED.email, ADMIN_SEED.password);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ reached: true });
    });
  });

  describe('suspended account', () => {
    let app: FastifyInstance;
    let ana: UserPo;

    beforeAll(async () => {
      await truncateAllTables(connection.db);
      ana = await insertAccount('ana@mesa.com', 'segredo-da-ana');
      app = await freshApp();
    });

    afterAll(() => app.close());

    async function suspendAna(at: Date | null): Promise<void> {
      await connection.db.update(users).set({ suspendedAt: at }).where(eq(users.id, ana.id));
    }

    it('the login records when the account was last seen', async () => {
      await suspendAna(null);
      await login(app, { identifier: 'ana@mesa.com', password: 'segredo-da-ana' });
      const [row] = await connection.db.select().from(users).where(eq(users.id, ana.id));
      expect(row?.lastSeenAt).toBeInstanceOf(Date);
    });

    it('the right password is 403 ACCOUNT_SUSPENDED and the wrong one 401 INVALID_CREDENTIALS', async () => {
      await suspendAna(new Date());
      const right = await login(app, { identifier: 'ana@mesa.com', password: 'segredo-da-ana' });
      expect(right.statusCode).toBe(403);
      expect(apiErrorDto.parse(right.json()).code).toBe('ACCOUNT_SUSPENDED');
      const wrong = await login(app, { identifier: 'ana@mesa.com', password: 'errada-123' });
      expect(apiErrorDto.parse(wrong.json()).code).toBe('INVALID_CREDENTIALS');
    });

    it('a cookie from before the suspension reads as anonymous', async () => {
      await suspendAna(null);
      const token = sessionCookieOf(
        await login(app, { identifier: 'ana@mesa.com', password: 'segredo-da-ana' }),
      );
      await suspendAna(new Date());
      expect(meResponseDto.parse((await me(app, token)).json()).user).toBeNull();
    });
  });

  describe('admin seed at boot', () => {
    beforeAll(() => truncateAllTables(connection.db));

    async function seededRows(): Promise<UserPo[]> {
      const index = testDataCipher().index('email-index', ADMIN_SEED.email);
      return connection.db.select().from(users).where(eq(users.emailIndex, index));
    }

    it('buildApp with ADMIN_* creates the admin, and a second boot neither duplicates it nor changes its hash', async () => {
      await (await freshApp({ adminSeed: ADMIN_SEED })).close();
      const [first] = await seededRows();
      await (
        await freshApp({ adminSeed: { ...ADMIN_SEED, password: 'another-password-456' } })
      ).close();
      const rows = await seededRows();
      expect(first).toMatchObject({ role: 'admin', username: 'admin', name: 'admin' });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.passwordHash).toBe(first?.passwordHash);
    });
  });
});
