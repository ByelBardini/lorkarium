import { apiErrorDto } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import { createDatabase, type DatabaseConnection } from '../../src/database/database';
import { ErrorReportSinkFake } from '../support/error-reports-fakes';
import { connectRealtime } from '../support/realtime-client';
import { signUpAndLogin } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const LOGIN = { identifier: 'ana@mesa.com', password: 'segredo-da-ana' };

describe('unexpected errors become reports', () => {
  const env: Env = { ...readEnv(process.env), adminSeed: null };
  let connection: DatabaseConnection;

  beforeAll(async () => {
    connection = await openTestDatabase();
    await truncateAllTables(connection.db);
  });

  afterAll(() => connection.close());

  // The boot itself reads the accounts, so the pool closes after it: every query then throws.
  async function appOnAClosedPool(sink: ErrorReportSinkFake): Promise<FastifyInstance> {
    const closed = createDatabase(env.databaseUrl);
    const app = await buildApp({ env, db: closed.db, errorReportSink: sink });
    await closed.close();
    return app;
  }

  describe('a 5xx', () => {
    let sink: ErrorReportSinkFake;
    let app: FastifyInstance;

    beforeAll(async () => {
      sink = new ErrorReportSinkFake();
      app = await appOnAClosedPool(sink);
    });

    afterAll(() => app.close());

    it('a route that fails unexpectedly answers 500 and files one report with the route pattern', async () => {
      const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: LOGIN });
      expect(response.statusCode).toBe(500);
      expect(apiErrorDto.parse(response.json()).code).toBe('INTERNAL_ERROR');
      expect(sink.reports).toHaveLength(1);
      const [report] = sink.reports;
      expect(report?.message).toBe('unexpected error in the auth module');
      expect(report?.error?.stack).toContain('at ');
      expect(report?.context).toMatchObject({ route: '/api/auth/login', method: 'POST' });
      expect(report?.context.reqId).toEqual(expect.any(String));
    });

    it('the same failure again within the minute files nothing new', async () => {
      await app.inject({ method: 'POST', url: '/api/auth/login', payload: LOGIN });
      expect(sink.reports).toHaveLength(1);
    });

    it('the health check with the database down answers 503 and files its report', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/health?x=1' });
      expect(response.statusCode).toBe(503);
      expect(sink.reports.map((report) => report.message)).toContain(
        'health check failed: database unavailable',
      );
      expect(sink.reports.at(-1)?.context.route).toBe('/api/health');
    });
  });

  describe('what is not an error', () => {
    let sink: ErrorReportSinkFake;
    let app: FastifyInstance;

    beforeAll(async () => {
      sink = new ErrorReportSinkFake();
      app = await buildApp({ env, db: connection.db, errorReportSink: sink });
    });

    afterAll(() => app.close());

    it('400, 401, 404, 429 and a warn file no report', async () => {
      const invalid = await app.inject({ method: 'POST', url: '/api/auth/login', payload: {} });
      const anonymous = await app.inject({ method: 'GET', url: '/api/campaigns' });
      const missing = await app.inject({ method: 'GET', url: '/api/nada' });
      const attempts = Array.from({ length: 6 }, () =>
        app.inject({ method: 'POST', url: '/api/auth/login', payload: LOGIN }),
      );
      const statuses = (await Promise.all(attempts)).map((response) => response.statusCode);
      app.log.warn({ reason: 'turnstile refused' }, 'human check refused');
      expect([invalid.statusCode, anonymous.statusCode, missing.statusCode]).toEqual([
        400, 401, 404,
      ]);
      expect(statuses).toContain(429);
      expect(sink.reports).toEqual([]);
    });
  });

  describe('who was affected', () => {
    let sink: ErrorReportSinkFake;
    let app: FastifyInstance;

    beforeAll(async () => {
      await truncateAllTables(connection.db);
      sink = new ErrorReportSinkFake();
      app = await buildApp({ env, db: connection.db, errorReportSink: sink });
      const { requireAuth } = app.authGuards;
      // The default handler of the root: the same `error` line any 5xx of the app writes.
      app.get('/api/boom/:id', { preHandler: requireAuth }, async () => {
        throw new Error('boom behind the guard');
      });
      app.get('/api/public-boom', async () => {
        throw new Error('boom in the open');
      });
    });

    afterAll(() => app.close());

    it('a 5xx behind the guard names the account by id and @, never by e-mail', async () => {
      const bia = await signUpAndLogin(app, connection.db, 'Bia');
      const cookies = { lk_session: bia.token };
      const response = await app.inject({ method: 'GET', url: '/api/boom/7?q=1', cookies });
      expect(response.statusCode).toBe(500);
      const report = sink.reports.find((each) => each.error?.message === 'boom behind the guard');
      expect(report?.user).toEqual({ id: bia.id, username: 'bia' });
      expect(report?.context.route).toBe('/api/boom/:id');
      expect(JSON.stringify(report)).not.toContain('bia@mesa.com');
    });

    it('a 5xx of a public route has no account, and the 401 of the guard files nothing', async () => {
      const before = sink.reports.length;
      const refused = await app.inject({ method: 'GET', url: '/api/boom/7' });
      expect(refused.statusCode).toBe(401);
      expect(sink.reports).toHaveLength(before);
      await app.inject({ method: 'GET', url: '/api/public-boom' });
      expect(sink.reports.at(-1)?.user).toBeNull();
    });
  });

  describe('a socket command that fails unexpectedly', () => {
    it('files one report with the account of the connection and the event', async () => {
      await truncateAllTables(connection.db);
      const sink = new ErrorReportSinkFake();
      const own = createDatabase(env.databaseUrl);
      const app = await buildApp({ env, db: own.db, errorReportSink: sink });
      const baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
      const bia = await signUpAndLogin(app, connection.db, 'Bia');
      const client = await connectRealtime(baseUrl, { token: bia.token });
      // The connection keeps its identity until the recheck, so only the command reaches the pool.
      await own.close();
      const campaignId = crypto.randomUUID();
      const join = { actionId: crypto.randomUUID(), campaignId };
      const answer = await client.timeout(2000).emitWithAck('session:join', join);
      client.close();
      await app.close();
      expect(answer).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
      expect(sink.reports).toHaveLength(1);
      expect(sink.reports[0]?.user).toEqual({ id: bia.id, username: null });
      expect(sink.reports[0]?.fields).toEqual({ event: 'session:join' });
    });
  });
});
