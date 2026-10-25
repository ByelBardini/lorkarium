import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import type { AccessRecord } from '../../src/modules/access-log/access-log.bo';
import { AccessLogArchiveFake } from '../support/access-log-fakes';
import { connectRealtime, disconnectionOf } from '../support/realtime-client';
import { signUpAndLogin } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const TRAEFIK = '10.0.1.5';
const PLAYER_IP = '203.0.113.7';

describe('access log (each answered request and live connection reaches the archive)', () => {
  const env: Env = { ...readEnv(process.env), adminSeed: null, trustProxyHops: 1 };
  let connection: DatabaseConnection;
  let archive: AccessLogArchiveFake;
  let app: FastifyInstance | undefined;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    await truncateAllTables(connection.db);
  });

  afterAll(() => connection.close());

  async function readyApp(): Promise<FastifyInstance> {
    archive = new AccessLogArchiveFake();
    app = await buildApp({ env, db: connection.db, accessLogArchive: archive });
    await app.ready();
    return app;
  }

  // Closing the app writes the last batch, as a deploy's SIGTERM does.
  async function recordsAfterClose(target: FastifyInstance): Promise<AccessRecord[]> {
    await target.close();
    app = undefined;
    return archive.records();
  }

  it('the boot writes its marker before the app serves anyone', async () => {
    await readyApp();

    expect(archive.batches.map((batch) => batch.key)).toEqual([
      expect.stringMatching(
        /^access-log\/boots\/\d{4}\/\d{2}\/\d{2}\/\d{6}Z-[0-9a-f]{8}\.jsonl\.gz$/,
      ),
    ]);
  });

  it('a logged-in request keeps the account, the IP the proxy wrote, the route and the status', async () => {
    const target = await readyApp();
    const ana = await signUpAndLogin(target, connection.db, 'Ana');

    const list = await target.inject({
      method: 'GET',
      url: '/api/campaigns',
      remoteAddress: TRAEFIK,
      headers: { cookie: `lk_session=${ana.token}`, 'x-forwarded-for': PLAYER_IP },
    });

    expect(list.statusCode).toBe(200);
    const records = await recordsAfterClose(target);
    // The auth plugin is registered before the hook: it still passes through it.
    expect(records).toContainEqual(
      expect.objectContaining({ route: '/api/auth/login', userId: null, status: 200 }),
    );
    expect(records).toContainEqual({
      kind: 'http',
      at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      ip: PLAYER_IP,
      userId: ana.id,
      method: 'GET',
      route: '/api/campaigns',
      status: 200,
    });
  });

  it('an anonymous request keeps no account, and the declared route keeps out ids and query', async () => {
    const target = await readyApp();

    const refused = await target.inject({
      method: 'GET',
      url: '/api/campaigns/9b1f0c2e-0000-4000-8000-000000000000?code=SEGREDO',
    });

    expect(refused.statusCode).toBe(401);
    const records = await recordsAfterClose(target);
    expect(records).toContainEqual(
      expect.objectContaining({ userId: null, route: '/api/campaigns/:campaignId', status: 401 }),
    );
    expect(JSON.stringify(records)).not.toContain('SEGREDO');
  });

  it('the health check the container polls is never recorded', async () => {
    const target = await readyApp();

    expect((await target.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);

    expect(await recordsAfterClose(target)).toStrictEqual([]);
  });

  it('a live connection is recorded when it opens and when it closes, under its account and IP', async () => {
    const target = await readyApp();
    const ana = await signUpAndLogin(target, connection.db, 'Ana');
    const baseUrl = await target.listen({ port: 0, host: '127.0.0.1' });
    const client = await connectRealtime(baseUrl, { token: ana.token, forwardedFor: PLAYER_IP });

    const closed = disconnectionOf(client);
    client.close();
    await closed;

    const live = (await recordsAfterClose(target)).filter((record) => record.kind !== 'http');
    expect(live).toStrictEqual([
      { kind: 'realtime-connect', at: expect.any(String), ip: PLAYER_IP, userId: ana.id },
      { kind: 'realtime-disconnect', at: expect.any(String), ip: PLAYER_IP, userId: ana.id },
    ]);
  });
});
