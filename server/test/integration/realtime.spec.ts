import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { connectRealtime, disconnectionOf, type RealtimeClient } from '../support/realtime-client';
import { signUpAndLogin, type SignedInUser } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

describe('realtime handshake', () => {
  const env: Env = { ...readEnv(process.env), adminSeed: null };
  const clients: RealtimeClient[] = [];
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let baseUrl: string;
  let ana: SignedInUser;
  let appClosed: boolean;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    app = await buildApp({ env, db: connection.db });
    baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
    appClosed = false;
    ana = await signUpAndLogin(app, connection.db, 'Ana');
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.close();
    if (!appClosed) await app.close();
  });

  async function connected(
    options: Parameters<typeof connectRealtime>[1],
  ): Promise<RealtimeClient> {
    const client = await connectRealtime(baseUrl, options);
    clients.push(client);
    return client;
  }

  it('a connection without the session cookie is refused with UNAUTHENTICATED', async () => {
    await expect(connectRealtime(baseUrl)).rejects.toMatchObject({ message: 'UNAUTHENTICATED' });
  });

  it('a connection with an unknown session cookie is refused with UNAUTHENTICATED', async () => {
    const refused = connectRealtime(baseUrl, { token: 'not-a-session' });
    await expect(refused).rejects.toMatchObject({ message: 'UNAUTHENTICATED' });
  });

  it('a connection with the cookie of a session ended by logout is refused with UNAUTHENTICATED', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { lk_session: ana.token },
    });
    const refused = connectRealtime(baseUrl, { token: ana.token });
    await expect(refused).rejects.toMatchObject({ message: 'UNAUTHENTICATED' });
  });

  it('a connection with a valid session cookie is accepted', async () => {
    const client = await connected({ token: ana.token });
    expect(client.connected).toBe(true);
  });

  it('a connection with the same Origin as the Host is accepted', async () => {
    const client = await connected({ token: ana.token, origin: baseUrl });
    expect(client.connected).toBe(true);
  });

  it('a connection from another Origin is refused even with a valid cookie', async () => {
    const refused = connectRealtime(baseUrl, { token: ana.token, origin: 'https://evil.example' });
    await expect(refused).rejects.toMatchObject({ message: 'websocket error' });
  });

  it('closing the app disconnects a connected client and finishes without error', async () => {
    const client = await connected({ token: ana.token });
    const disconnected = disconnectionOf(client);
    appClosed = true;
    await expect(app.close()).resolves.toBeUndefined();
    expect(await disconnected).toMatch(/io server disconnect|transport close/);
  });
});
