import {
  accountSessionsResponseDto,
  apiErrorDto,
  revokeOthersResponseDto,
} from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { authSessions } from '../../src/modules/auth/auth-sessions.po';
import { accountRequest, logInAs } from '../support/account-security-http';
import { connectRealtime, disconnectionOf, type RealtimeClient } from '../support/realtime-client';
import { insertTestAccount } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const PASSWORD = 'senha-de-teste';
const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

describe('account sessions (where you are signed in)', () => {
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let baseUrl: string;
  let anaId: string;
  let laptop: string;
  let phone: string;
  const sockets: RealtimeClient[] = [];

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const ana = await insertTestAccount(connection.db, {
      name: 'Ana',
      email: 'ana@mesa.com',
      password: PASSWORD,
    });
    anaId = ana.id;
    await insertTestAccount(connection.db, {
      name: 'Bia',
      email: 'bia@mesa.com',
      password: PASSWORD,
    });
    app = await buildApp({ env: { ...readEnv(process.env), adminSeed: null }, db: connection.db });
    baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
    laptop = await logInAs(app, 'ana@mesa.com', PASSWORD, CHROME_WINDOWS);
    phone = await logInAs(app, 'ana@mesa.com', PASSWORD, SAFARI_IPHONE);
  });

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.close();
    await app.close();
  });

  function list(token: string): ReturnType<typeof accountRequest> {
    return accountRequest(app, { method: 'GET', url: '/api/account/sessions', token });
  }

  async function publicIdOf(token: string, current: boolean): Promise<string> {
    const { sessions } = accountSessionsResponseDto.parse((await list(token)).json());
    const found = sessions.find((session) => session.current === current);
    if (!found) throw new Error(`no session with current=${current}: ${JSON.stringify(sessions)}`);
    return found.id;
  }

  it('two logins of Ana list two devices, the one asking marked current', async () => {
    const response = await list(laptop);
    expect(response.statusCode).toBe(200);
    const { sessions } = accountSessionsResponseDto.parse(response.json());
    expect(sessions).toHaveLength(2);
    const devices = sessions.map(({ browser, os, formFactor, current }) => ({
      browser,
      os,
      formFactor,
      current,
    }));
    expect(devices).toEqual(
      expect.arrayContaining([
        { browser: 'chrome', os: 'windows', formFactor: 'desktop', current: true },
        { browser: 'safari', os: 'ios', formFactor: 'mobile', current: false },
      ]),
    );
  });

  it('the list never carries the token hash', async () => {
    const rows = await connection.db
      .select()
      .from(authSessions)
      .where(eq(authSessions.userId, anaId));
    const body = (await list(laptop)).body;
    for (const row of rows) expect(body).not.toContain(row.id);
  });

  it('without a session the list is 401', async () => {
    const response = await accountRequest(app, { method: 'GET', url: '/api/account/sessions' });
    expect(response.statusCode).toBe(401);
  });

  it('ending the other session: its cookie gets 401 and its realtime connection drops', async () => {
    const socket = await connectRealtime(baseUrl, { token: phone });
    sockets.push(socket);
    const dropped = disconnectionOf(socket);
    const phoneId = await publicIdOf(laptop, false);
    const response = await accountRequest(app, {
      method: 'DELETE',
      url: `/api/account/sessions/${phoneId}`,
      token: laptop,
    });
    expect(response.statusCode).toBe(204);
    expect(await dropped).toBe('io server disconnect');
    expect((await list(phone)).statusCode).toBe(401);
    expect((await list(laptop)).statusCode).toBe(200);
  });

  it('ending the current session is 409 CURRENT_SESSION', async () => {
    const laptopId = await publicIdOf(laptop, true);
    const response = await accountRequest(app, {
      method: 'DELETE',
      url: `/api/account/sessions/${laptopId}`,
      token: laptop,
    });
    expect(response.statusCode).toBe(409);
    expect(apiErrorDto.parse(response.json()).code).toBe('CURRENT_SESSION');
  });

  it("ending Bia's session is 404 SESSION_NOT_FOUND and hers keeps working", async () => {
    const bia = await logInAs(app, 'bia@mesa.com', PASSWORD);
    const biaId = await publicIdOf(bia, true);
    const response = await accountRequest(app, {
      method: 'DELETE',
      url: `/api/account/sessions/${biaId}`,
      token: laptop,
    });
    expect(response.statusCode).toBe(404);
    expect(apiErrorDto.parse(response.json()).code).toBe('SESSION_NOT_FOUND');
    expect((await list(bia)).statusCode).toBe(200);
  });

  it('a malformed session id is the same 404', async () => {
    const response = await accountRequest(app, {
      method: 'DELETE',
      url: '/api/account/sessions/nao-e-uuid',
      token: laptop,
    });
    expect(response.statusCode).toBe(404);
  });

  it('revoke-others with 3 sessions ends 2 and keeps the one asking', async () => {
    const tablet = await logInAs(app, 'ana@mesa.com', PASSWORD, SAFARI_IPHONE);
    const response = await accountRequest(app, {
      method: 'POST',
      url: '/api/account/sessions/revoke-others',
      token: laptop,
    });
    expect(response.statusCode).toBe(200);
    expect(revokeOthersResponseDto.parse(response.json())).toEqual({ revoked: 2 });
    expect((await list(phone)).statusCode).toBe(401);
    expect((await list(tablet)).statusCode).toBe(401);
    expect((await list(laptop)).statusCode).toBe(200);
  });

  it('the login keeps the user agent on the session row', async () => {
    const rows = await connection.db
      .select()
      .from(authSessions)
      .where(eq(authSessions.userId, anaId));
    expect(rows.map((row) => row.userAgent).sort()).toEqual([CHROME_WINDOWS, SAFARI_IPHONE].sort());
  });
});
