import { meResponseDto } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import {
  connectRealtime,
  disconnectionOf,
  reconnectionOf,
  type RealtimeClient,
} from '../support/realtime-client';
import { insertTestAccount } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const ANA = { name: 'Ana', email: 'ana@mesa.com', password: 'segredo-da-ana' };

// What a deploy does to the app: the running one closes and a new one boots on the same database.
describe('a deploy (the app closes and a new one boots on the same database)', () => {
  const env: Env = { ...readEnv(process.env), adminSeed: null };
  const clients: RealtimeClient[] = [];
  const running: FastifyInstance[] = [];
  let connection: DatabaseConnection;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    await insertTestAccount(connection.db, ANA);
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.close();
    for (const app of running.splice(0)) await app.close();
  });

  async function bootApp(): Promise<FastifyInstance> {
    const app = await buildApp({ env, db: connection.db });
    running.push(app);
    return app;
  }

  async function closeApp(app: FastifyInstance): Promise<void> {
    running.splice(running.indexOf(app), 1);
    await app.close();
  }

  async function rememberedSessionOf(app: FastifyInstance): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: 'ana', password: ANA.password, rememberMe: true },
    });
    const cookie = response.cookies.find((candidate) => candidate.name === 'lk_session');
    if (!cookie?.maxAge) {
      throw new Error(`expected a persistent lk_session, got ${response.headers['set-cookie']}`);
    }
    return cookie.value;
  }

  it('a "keep me signed in" session still answers /me on the new app', async () => {
    const before = await bootApp();
    const token = await rememberedSessionOf(before);
    await closeApp(before);
    const after = await bootApp();
    const me = await after.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { lk_session: token },
    });
    expect(meResponseDto.parse(me.json()).user).toMatchObject({ username: 'ana' });
  });

  it('a realtime client reconnects by itself to the new app, with the same cookie', async () => {
    const before = await bootApp();
    const baseUrl = await before.listen({ port: 0, host: '127.0.0.1' });
    const token = await rememberedSessionOf(before);
    const client = await connectRealtime(baseUrl, { token, reconnect: true });
    clients.push(client);
    const dropped = disconnectionOf(client);
    await closeApp(before);
    expect(await dropped).toBe('transport close');
    const back = reconnectionOf(client, 4000);
    const after = await bootApp();
    await after.listen({ port: Number(new URL(baseUrl).port), host: '127.0.0.1' });
    await back;
    expect(client.connected).toBe(true);
  });
});
