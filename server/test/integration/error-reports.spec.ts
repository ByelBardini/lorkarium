import { apiErrorDto, errorReportingSettingsDto, meResponseDto } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { ClientErrorRelayFake, ErrorReportSinkFake } from '../support/error-reports-fakes';
import { logIn, signUpAndLogin, type SignedInUser } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const DSN = 'https://abc@o1.ingest.de.sentry.io/123';
const REPORTING = { dsn: DSN, environment: 'staging', release: '80352806' };
const ADMIN_SEED = { email: 'root@lorkarium.dev', password: 'root-password-123' };
const SDK_CONTENT_TYPE = 'text/plain;charset=UTF-8';

function envelopeOf(dsn: string, ...items: [string, object][]): string {
  const lines = [JSON.stringify({ dsn, event_id: 'e1' })];
  for (const [type, payload] of items)
    lines.push(JSON.stringify({ type }), JSON.stringify(payload));
  return `${lines.join('\n')}\n`;
}

const EVENT = {
  exception: { values: [{ type: 'TypeError', value: 'x is undefined' }] },
  user: { id: 'forjado' },
  request: { url: 'https://mesa.example.com/reset-password?token=abc' },
};

describe('error reports HTTP edge', () => {
  const base: Env = { ...readEnv(process.env), adminSeed: null };
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let relay: ClientErrorRelayFake;
  let sink: ErrorReportSinkFake;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  async function start(overrides: Partial<Env> = {}, failing = false): Promise<void> {
    relay = failing ? new ClientErrorRelayFake().failing() : new ClientErrorRelayFake();
    sink = new ErrorReportSinkFake();
    const env = { ...base, errorReporting: REPORTING, ...overrides };
    app = await buildApp({
      env,
      db: connection.db,
      clientErrorRelay: relay,
      errorReportSink: sink,
    });
  }

  function report(body: string, options: { token?: string; contentType?: string } = {}) {
    return app.inject({
      method: 'POST',
      url: '/api/error-reports',
      headers: { 'content-type': options.contentType ?? SDK_CONTENT_TYPE },
      cookies: options.token ? { lk_session: options.token } : {},
      payload: body,
    });
  }

  function forwardedEvent(index = 0): Record<string, unknown> {
    const lines = relay.forwarded[index]?.trim().split('\n') ?? [];
    return JSON.parse(lines[2] ?? 'null') as Record<string, unknown>;
  }

  beforeEach(async () => {
    await truncateAllTables(connection.db);
  });

  afterEach(() => app.close());

  describe('GET /api/error-reports/settings', () => {
    it('without a DSN answers dsn null and the node environment', async () => {
      await start({ errorReporting: null });
      const response = await app.inject({ method: 'GET', url: '/api/error-reports/settings' });
      expect(errorReportingSettingsDto.parse(response.json())).toEqual({
        dsn: null,
        environment: 'test',
        release: null,
      });
    });

    it('with a DSN answers it, with no session', async () => {
      await start();
      const response = await app.inject({ method: 'GET', url: '/api/error-reports/settings' });
      expect(errorReportingSettingsDto.parse(response.json())).toEqual(REPORTING);
    });
  });

  describe('POST /api/error-reports', () => {
    it('forwards the event stamped with the session account, never the forged one, without the query', async () => {
      await start();
      const bia = await signUpAndLogin(app, connection.db, 'Bia');
      const response = await report(envelopeOf(DSN, ['event', EVENT]), { token: bia.token });
      expect(response.statusCode).toBe(200);
      expect(relay.forwarded).toHaveLength(1);
      expect(forwardedEvent()).toMatchObject({
        user: { id: bia.id, username: 'bia' },
        request: { url: 'https://mesa.example.com/reset-password' },
      });
    });

    it('anonymous (the sign-in screen) forwards the event without user', async () => {
      await start();
      expect((await report(envelopeOf(DSN, ['event', EVENT]))).statusCode).toBe(200);
      expect(forwardedEvent()).not.toHaveProperty('user');
    });

    it('accepts the envelope content type too', async () => {
      await start();
      const contentType = 'application/x-sentry-envelope';
      expect((await report(envelopeOf(DSN, ['event', {}]), { contentType })).statusCode).toBe(200);
      expect(relay.forwarded).toHaveLength(1);
    });

    it('another project is 403 UNKNOWN_DSN and forwards nothing', async () => {
      await start();
      const response = await report(envelopeOf('https://x@o9.ingest.sentry.io/9', ['event', {}]));
      expect(response.statusCode).toBe(403);
      expect(apiErrorDto.parse(response.json()).code).toBe('UNKNOWN_DSN');
      expect(relay.forwarded).toEqual([]);
    });

    it('a body that is not an envelope is 400 INVALID_ENVELOPE', async () => {
      await start();
      const response = await report('isto não é um envelope');
      expect(response.statusCode).toBe(400);
      expect(apiErrorDto.parse(response.json()).code).toBe('INVALID_ENVELOPE');
    });

    it('a body above 200 KB is 413 and forwards nothing', async () => {
      await start();
      const huge = envelopeOf(DSN, ['event', { message: 'x'.repeat(210 * 1024) }]);
      expect((await report(huge)).statusCode).toBe(413);
      expect(relay.forwarded).toEqual([]);
    });

    it('the 21st envelope of the same IP within a minute is 429', async () => {
      await start();
      const statuses: number[] = [];
      for (let index = 0; index < 21; index += 1) {
        statuses.push((await report(envelopeOf(DSN, ['session', {}]))).statusCode);
      }
      expect(statuses.slice(0, 20).every((status) => status === 200)).toBe(true);
      expect(statuses[20]).toBe(429);
    });

    it('only a session item is 200 and forwards nothing', async () => {
      await start();
      expect((await report(envelopeOf(DSN, ['session', {}]))).statusCode).toBe(200);
      expect(relay.forwarded).toEqual([]);
    });

    it('without a DSN configured it is 204 and forwards nothing', async () => {
      await start({ errorReporting: null });
      expect((await report(envelopeOf(DSN, ['event', {}]))).statusCode).toBe(204);
      expect(relay.forwarded).toEqual([]);
    });

    it('a relay that fails still answers 200 and files no report (no loop)', async () => {
      await start({}, true);
      expect((await report(envelopeOf(DSN, ['event', {}]))).statusCode).toBe(200);
      expect(sink.reports).toEqual([]);
    });
  });

  describe('POST /api/admin/error-reports/test', () => {
    const test = (token?: string) =>
      app.inject({
        method: 'POST',
        url: '/api/admin/error-reports/test',
        cookies: token ? { lk_session: token } : {},
      });

    it('the admin gets a 500 and the server files one ErrorReportTestError with the account', async () => {
      await start({ adminSeed: ADMIN_SEED });
      const token = await logIn(app, ADMIN_SEED.email, ADMIN_SEED.password);
      const me = meResponseDto.parse(
        (
          await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { lk_session: token } })
        ).json(),
      );
      const response = await test(token);
      expect(response.statusCode).toBe(500);
      expect(apiErrorDto.parse(response.json()).code).toBe('INTERNAL_ERROR');
      expect(sink.reports).toHaveLength(1);
      expect(sink.reports[0]?.error?.name).toBe('ErrorReportTestError');
      expect(sink.reports[0]?.user).toEqual({ id: me.user?.id, username: me.user?.username });
    });

    it('a player is 403, no session is 401, and neither files a report', async () => {
      await start();
      const bia: SignedInUser = await signUpAndLogin(app, connection.db, 'Bia');
      expect((await test(bia.token)).statusCode).toBe(403);
      expect((await test()).statusCode).toBe(401);
      expect(sink.reports).toEqual([]);
    });

    it('the 6th test within a minute is 429', async () => {
      await start({ adminSeed: ADMIN_SEED });
      const token = await logIn(app, ADMIN_SEED.email, ADMIN_SEED.password);
      const statuses: number[] = [];
      for (let index = 0; index < 6; index += 1) statuses.push((await test(token)).statusCode);
      expect(statuses).toEqual([500, 500, 500, 500, 500, 429]);
    });
  });
});
