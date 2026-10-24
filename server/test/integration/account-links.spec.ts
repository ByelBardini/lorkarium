import {
  acceptInvitationResponseDto,
  adminDirectoryResponseDto,
  apiErrorDto,
  invitationInspectResponseDto,
  invitationLinkResponseDto,
  meResponseDto,
} from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { users } from '../../src/modules/auth/users.po';
import { MailerFake } from '../support/account-security-fakes';
import { cookieOf } from '../support/account-security-http';
import { ClockFake } from '../support/auth-fakes';
import { insertTestAccount, logIn, type SignedInUser } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const PASSWORD = 'senha-de-teste';
const APP_PUBLIC_URL = 'https://mesa.example.com';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

describe('invitations', () => {
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let mailer: MailerFake;
  let clock: ClockFake;
  let admin: SignedInUser;
  let bia: SignedInUser;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    mailer = new MailerFake();
    clock = new ClockFake(new Date());
    const env = { ...readEnv(process.env), adminSeed: null, appPublicUrl: APP_PUBLIC_URL };
    app = await buildApp({ env, db: connection.db, mailer, clock });
    admin = await account('Lucas', 'admin');
    bia = await account('Bia');
  });

  afterEach(() => app.close());

  async function account(name: string, role: 'user' | 'admin' = 'user'): Promise<SignedInUser> {
    const email = `${name.toLowerCase()}@mesa.com`;
    const row = await insertTestAccount(connection.db, { name, email, password: PASSWORD });
    if (role === 'admin')
      await connection.db.update(users).set({ role }).where(eq(users.id, row.id));
    return { id: row.id, token: await logIn(app, email, PASSWORD) };
  }

  function post(url: string, payload?: object, token?: string): Promise<LightMyRequestResponse> {
    return app.inject({
      method: 'POST',
      url: `/api${url}`,
      cookies: token ? { lk_session: token } : {},
      ...(payload ? { payload } : {}),
    });
  }

  async function invite(email: string, role: 'user' | 'admin' = 'user') {
    const response = await post('/admin/invitations', { email, role }, admin.token);
    return { response, created: invitationLinkResponseDto.safeParse(response.json()).data };
  }

  function tokenOf(link: string): string {
    return decodeURIComponent(link.split('#token=')[1] ?? '');
  }

  function accept(token: string, username = 'marina') {
    return post('/invitations/accept', {
      token,
      username,
      password: 'senha-da-marina',
      persistent: false,
    });
  }

  it('inviting answers 201 with the link and mails the same link', async () => {
    const { response, created } = await invite('Marina@Exemplo.com');
    expect(response.statusCode).toBe(201);
    expect(created?.link).toMatch(/^https:\/\/mesa\.example\.com\/invite#token=/);
    expect(mailer.lastTokenFor('marina@exemplo.com', /\/invite#token=([^\s"<]+)/)).toBe(
      tokenOf(created?.link ?? ''),
    );
  });

  it('the list brings the pending invitation with who invited', async () => {
    await invite('marina@exemplo.com');
    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      cookies: { lk_session: admin.token },
    });
    expect(adminDirectoryResponseDto.parse(list.json()).invitations).toMatchObject([
      { email: 'marina@exemplo.com', role: 'user', invitedBy: 'lucas' },
    ]);
  });

  it('an address of an account is 409 EMAIL_TAKEN; a pending one is ALREADY_INVITED with its id', async () => {
    expect(apiErrorDto.parse((await invite('bia@mesa.com')).response.json()).code).toBe(
      'EMAIL_TAKEN',
    );
    const { created } = await invite('marina@exemplo.com');
    const again = apiErrorDto.parse((await invite('marina@exemplo.com')).response.json());
    expect(again).toMatchObject({ code: 'ALREADY_INVITED', invitationId: created?.invitation.id });
  });

  it('resending kills the old link; cancelling takes it off the list', async () => {
    const { created } = await invite('marina@exemplo.com');
    const id = created?.invitation.id ?? '';
    await post(`/admin/invitations/${id}/resend`, undefined, admin.token);
    expect(
      (await post('/invitations/inspect', { token: tokenOf(created?.link ?? '') })).statusCode,
    ).toBe(404);
    const cancel = await app.inject({
      method: 'DELETE',
      url: `/api/admin/invitations/${id}`,
      cookies: { lk_session: admin.token },
    });
    expect(cancel.statusCode).toBe(204);
    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      cookies: { lk_session: admin.token },
    });
    expect(adminDirectoryResponseDto.parse(list.json()).invitations).toEqual([]);
  });

  it('a player inviting is 403', async () => {
    const response = await post(
      '/admin/invitations',
      { email: 'x@x.com', role: 'user' },
      bia.token,
    );
    expect(response.statusCode).toBe(403);
  });

  it('inspect answers the address and a free @ from it', async () => {
    const { created } = await invite('bia@outro.com');
    const inspect = await post('/invitations/inspect', { token: tokenOf(created?.link ?? '') });
    expect(invitationInspectResponseDto.parse(inspect.json())).toEqual({
      email: 'bia@outro.com',
      suggestedUsername: 'bia2',
    });
  });

  it('accepting signs in with the cookie; the account has nickname = @ and the role of the invitation', async () => {
    const { created } = await invite('marina@exemplo.com', 'admin');
    const response = await accept(tokenOf(created?.link ?? ''));
    expect(response.statusCode).toBe(200);
    const { user } = acceptInvitationResponseDto.parse(response.json());
    expect(user).toMatchObject({
      username: 'marina',
      name: 'marina',
      role: 'admin',
      email: 'marina@exemplo.com',
    });
    const session = cookieOf(response, 'lk_session').value;
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { lk_session: session },
    });
    expect(meResponseDto.parse(me.json()).user?.username).toBe('marina');
    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      cookies: { lk_session: session },
    });
    expect(list.statusCode).toBe(200);
  });

  it('the same token twice is 404; an expired one too', async () => {
    const first = await invite('marina@exemplo.com');
    const token = tokenOf(first.created?.link ?? '');
    await accept(token);
    expect((await accept(token, 'marina2')).statusCode).toBe(404);
    const second = await invite('joao@exemplo.com');
    clock.current = new Date(clock.current.getTime() + SEVEN_DAYS_MS);
    expect((await accept(tokenOf(second.created?.link ?? ''), 'joao')).statusCode).toBe(404);
  });

  it('a taken @ is 409 USERNAME_TAKEN and the invitation still works', async () => {
    const { created } = await invite('marina@exemplo.com');
    const token = tokenOf(created?.link ?? '');
    const taken = await accept(token, 'bia');
    expect(apiErrorDto.parse(taken.json()).code).toBe('USERNAME_TAKEN');
    expect((await accept(token, 'marina')).statusCode).toBe(200);
  });

  it('an account created with the address meanwhile is 409 EMAIL_TAKEN', async () => {
    const { created } = await invite('marina@exemplo.com');
    await insertTestAccount(connection.db, {
      name: 'Marina',
      email: 'marina@exemplo.com',
      password: PASSWORD,
    });
    const response = await accept(tokenOf(created?.link ?? ''), 'marina.r');
    expect(apiErrorDto.parse(response.json()).code).toBe('EMAIL_TAKEN');
  });
});

describe('invitation limits', () => {
  it('the 11th public attempt in a minute from one IP is 429', async () => {
    const connection = await openTestDatabase();
    const app = await buildApp({
      env: { ...readEnv(process.env), adminSeed: null },
      db: connection.db,
      mailer: new MailerFake(),
    });
    try {
      const attempt = () =>
        app.inject({
          method: 'POST',
          url: '/api/invitations/inspect',
          payload: { token: 'inventado' },
        });
      for (let index = 0; index < 10; index += 1) await attempt();
      expect((await attempt()).statusCode).toBe(429);
    } finally {
      await app.close();
      await connection.close();
    }
  });

  it('the 21st invitation of an admin in 10 minutes is 429', async () => {
    const connection = await openTestDatabase();
    await truncateAllTables(connection.db);
    const app = await buildApp({
      env: { ...readEnv(process.env), adminSeed: null },
      db: connection.db,
      mailer: new MailerFake(),
    });
    try {
      const row = await insertTestAccount(connection.db, {
        name: 'Lucas',
        email: 'lucas@mesa.com',
        password: PASSWORD,
      });
      await connection.db.update(users).set({ role: 'admin' }).where(eq(users.id, row.id));
      const token = await logIn(app, 'lucas@mesa.com', PASSWORD);
      const invite = (index: number) =>
        app.inject({
          method: 'POST',
          url: '/api/admin/invitations',
          cookies: { lk_session: token },
          payload: { email: `p${index}@x.com`, role: 'user' },
        });
      for (let index = 0; index < 20; index += 1) await invite(index);
      expect((await invite(20)).statusCode).toBe(429);
    } finally {
      await app.close();
      await connection.close();
    }
  });
});
