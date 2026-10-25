import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { authSessions } from '../../src/modules/auth/auth-sessions.po';
import { ClockFake } from '../support/auth-fakes';
import { CountingQueryLog } from '../support/query-count';
import { connectRealtime, disconnectionOf, type RealtimeClient } from '../support/realtime-client';
import { logIn, signUpAndLogin, type SignedInUser } from '../support/sign-in';
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

  // "io server disconnect" would leave the browser offline for good after a deploy.
  it('closing the app drops only the transport, so the client may reconnect, and finishes without error', async () => {
    const client = await connected({ token: ana.token });
    const disconnected = disconnectionOf(client);
    appClosed = true;
    await expect(app.close()).resolves.toBeUndefined();
    expect(await disconnected).toBe('transport close');
  });
});

describe('the identity kept on the connection', () => {
  const env: Env = { ...readEnv(process.env), adminSeed: null };
  const clients: RealtimeClient[] = [];
  const queries = new CountingQueryLog();
  const clock = new ClockFake(new Date('2026-10-22T12:00:00Z'));
  const SESSION_READS = /from "(auth_sessions|users)"/;
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let baseUrl: string;
  let ana: SignedInUser;

  beforeAll(async () => {
    connection = await openTestDatabase({ queryLog: queries });
  });

  afterAll(() => connection.close());

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    clock.current = new Date('2026-10-22T12:00:00Z');
    app = await buildApp({ env, db: connection.db, clock });
    baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
    ana = await signUpAndLogin(app, connection.db, 'Ana');
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.close();
    await app.close();
  });

  async function connected(token: string): Promise<RealtimeClient> {
    const client = await connectRealtime(baseUrl, { token });
    clients.push(client);
    return client;
  }

  // Any table command re-checks the session first; a table not open here answers `ok` untouched.
  async function activity(client: RealtimeClient): Promise<unknown> {
    const command = { actionId: crypto.randomUUID(), campaignId: crypto.randomUUID(), away: true };
    return client.timeout(2000).emitWithAck('session:setActivity', command);
  }

  function hoursLater(hours: number): void {
    clock.current = new Date(clock.current.getTime() + hours * 60 * 60 * 1000);
  }

  it('a command after the handshake reads neither auth_sessions nor users', async () => {
    const client = await connected(ana.token);
    queries.reset();
    expect(await activity(client)).toEqual({ ok: true });
    expect(queries.matching(SESSION_READS)).toBe(0);
  });

  it('logout over HTTP drops the sockets of that session and keeps another session of Ana', async () => {
    const otherToken = await logIn(app, 'ana@mesa.com', 'senha-de-teste');
    const [loggedOut, kept] = [await connected(ana.token), await connected(otherToken)];
    const dropped = disconnectionOf(loggedOut);
    await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { lk_session: ana.token },
    });
    expect(await dropped).toBe('io server disconnect');
    expect(await activity(kept)).toEqual({ ok: true });
  });

  it('past the deadline on the clock, the next command gets UNAUTHENTICATED and the connection drops', async () => {
    const client = await connected(ana.token);
    const dropped = disconnectionOf(client);
    hoursLater(13);
    expect(await activity(client)).toEqual({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'A valid session is required' },
    });
    expect(await dropped).toBe('io server disconnect');
  });

  it('a session already expired in the database ends the connection at the recheck', async () => {
    const client = await connected(ana.token);
    await connection.db.update(authSessions).set({ expiresAt: new Date('2026-10-22T13:00:00Z') });
    hoursLater(7);
    expect(await activity(client)).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
  });

  it('a session renewed over HTTP after the handshake is read once and the connection goes on', async () => {
    const client = await connected(ana.token);
    hoursLater(7);
    await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { lk_session: ana.token } });
    queries.reset();
    expect(await activity(client)).toEqual({ ok: true });
    expect(queries.matching(/from "auth_sessions"/)).toBe(1);
    queries.reset();
    expect(await activity(client)).toEqual({ ok: true });
    expect(queries.matching(SESSION_READS)).toBe(0);
  });
});
