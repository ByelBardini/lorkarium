import { apiErrorDto } from '@lorkarium/contracts';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

// The login allows 5 attempts per IP and e-mail per minute; the 6th is refused.
const ATTEMPTS_BEFORE_LIMIT = 5;
const TRAEFIK = '10.0.1.5';

describe('login rate limit behind a proxy (TRUST_PROXY)', () => {
  const env: Env = { ...readEnv(process.env), adminSeed: null };
  let connection: DatabaseConnection;
  let app: FastifyInstance | undefined;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterEach(async () => {
    await app?.close();
    await truncateAllTables(connection.db);
  });

  afterAll(() => connection.close());

  async function appTrusting(trustProxyHops: number): Promise<FastifyInstance> {
    app = await buildApp({ env: { ...env, trustProxyHops }, db: connection.db });
    return app;
  }

  function loginFrom(
    target: FastifyInstance,
    forwardedFor: string,
  ): Promise<LightMyRequestResponse> {
    return target.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: TRAEFIK,
      headers: { 'x-forwarded-for': forwardedFor },
      payload: { identifier: 'alvo@mesa.com', password: 'x' },
    });
  }

  async function exhaustLimit(target: FastifyInstance, forwardedFor: string): Promise<void> {
    for (let attempt = 1; attempt <= ATTEMPTS_BEFORE_LIMIT; attempt += 1) {
      expect((await loginFrom(target, forwardedFor)).statusCode).toBe(401);
    }
  }

  it('with 1 trusted hop another player IP is not blocked by the exhausted one', async () => {
    const target = await appTrusting(1);
    await exhaustLimit(target, '203.0.113.7');
    expect((await loginFrom(target, '203.0.113.8')).statusCode).toBe(401);
  });

  it('with 0 trusted hops a forged X-Forwarded-For does not escape the limit', async () => {
    const target = await appTrusting(0);
    await exhaustLimit(target, '203.0.113.7');
    const blocked = await loginFrom(target, '203.0.113.8');
    expect(blocked.statusCode).toBe(429);
    expect(apiErrorDto.parse(blocked.json()).code).toBe('RATE_LIMITED');
  });

  it('with 1 trusted hop the IP the proxy wrote counts, never the first one the client chose', async () => {
    const target = await appTrusting(1);
    await exhaustLimit(target, '198.51.100.1, 203.0.113.7');
    expect((await loginFrom(target, '203.0.113.7')).statusCode).toBe(429);
  });
});
