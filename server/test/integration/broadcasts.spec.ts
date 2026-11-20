import {
  apiErrorDto,
  mailBroadcastDraftResponseDto,
  mailBroadcastPreviewDto,
  mailBroadcastResponseDto,
  mailBroadcastsResponseDto,
  mailBroadcastTestResponseDto,
} from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { userTwoFactor } from '../../src/modules/auth/two-factor.po';
import { users } from '../../src/modules/auth/users.po';
import { mailBroadcastDeliveries } from '../../src/modules/broadcasts/mail-broadcast-deliveries.po';
import { MailerFake } from '../support/account-security-fakes';
import { insertTestAccount, logIn, type SignedInUser } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const PASSWORD = 'senha-de-teste';
const NOTICE = {
  segment: 'all',
  subject: 'Os preços mudam em 30 dias',
  title: 'Novos preços',
  paragraphs: ['A partir de 1º de janeiro o Narrador custa R$ 19,90.'],
  button: { label: 'Ver os planos', href: 'https://lorkarium.com.br/planos' },
};

describe('backoffice notices (/api/admin/broadcasts)', () => {
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let mailer: MailerFake;
  let admin: SignedInUser;
  let ana: SignedInUser;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    mailer = new MailerFake();
    const env = { ...readEnv(process.env), adminSeed: null, mailReplyTo: 'contato@mesa.com' };
    app = await buildApp({ env, db: connection.db, mailer });
    admin = await account('Fernanda', 'admin');
    ana = await account('Ana');
    await account('Bia');
    const caio = await account('Caio');
    await connection.db.update(users).set({ suspendedAt: new Date() }).where(eq(users.id, caio.id));
  });

  afterEach(() => app.close());

  async function account(name: string, role: 'user' | 'admin' = 'user'): Promise<SignedInUser> {
    const email = `${name.toLowerCase()}@mesa.com`;
    const row = await insertTestAccount(connection.db, { name, email, password: PASSWORD });
    if (role === 'admin')
      await connection.db.update(users).set({ role }).where(eq(users.id, row.id));
    return { id: row.id, token: await logIn(app, email, PASSWORD) };
  }

  // After the login: with 2FA on, the login would ask a second step.
  async function turnOnTwoFactor(userId: string): Promise<void> {
    await connection.db
      .insert(userTwoFactor)
      .values({ userId, secretCipher: 'sealed', enabledAt: new Date() });
  }

  function call(
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    token?: string,
    payload?: object,
  ): Promise<LightMyRequestResponse> {
    return app.inject({
      method,
      url: `/api${url}`,
      cookies: token ? { lk_session: token } : {},
      ...(payload ? { payload } : {}),
    });
  }

  async function draft(): Promise<string> {
    const response = await call('POST', '/admin/broadcasts', admin.token, NOTICE);
    return mailBroadcastDraftResponseDto.parse(response.json()).broadcast.id;
  }

  async function testedDraft(): Promise<string> {
    const id = await draft();
    await call('POST', `/admin/broadcasts/${id}/test`, admin.token);
    return id;
  }

  async function deliveriesOf(broadcastId: string): Promise<number> {
    return connection.db.$count(
      mailBroadcastDeliveries,
      eq(mailBroadcastDeliveries.broadcastId, broadcastId),
    );
  }

  function codeOf(response: LightMyRequestResponse): string {
    return apiErrorDto.parse(response.json()).code;
  }

  it('creating a draft answers 201 with no total yet and the audience of the segment now', async () => {
    const response = await call('POST', '/admin/broadcasts', admin.token, NOTICE);
    expect(response.statusCode).toBe(201);
    const body = mailBroadcastDraftResponseDto.parse(response.json());
    expect(body.audience).toBe(3);
    expect(body.broadcast).toMatchObject({ subject: NOTICE.subject, total: null, testedAt: null });
  });

  it('the audience of a segment counts the accounts it reaches now', async () => {
    const all = await call('POST', '/admin/broadcasts/audience', admin.token, { segment: 'all' });
    const paid = await call('POST', '/admin/broadcasts/audience', admin.token, {
      segment: 'paid',
    });
    expect([all.json(), paid.json()]).toEqual([{ audience: 3 }, { audience: 0 }]);
  });

  it('the preview is the HTML the server renders, greeting the admin, with the audience', async () => {
    const response = await call('POST', '/admin/broadcasts/preview', admin.token, NOTICE);
    const body = mailBroadcastPreviewDto.parse(response.json());
    expect(body.audience).toBe(3);
    expect(body.html).toContain('Oi, Fernanda!');
    expect(body.html).toContain('https://lorkarium.com.br/planos');
  });

  it('a test goes only to the admin who asks, with the reply-to, and marks the draft tested', async () => {
    const id = await draft();
    const response = await call('POST', `/admin/broadcasts/${id}/test`, admin.token);
    const body = mailBroadcastTestResponseDto.parse(response.json());
    expect(body.to).toBe('fernanda@mesa.com');
    expect(body.broadcast.testedAt).not.toBeNull();
    expect(mailer.sent.map(({ to, replyTo }) => ({ to, replyTo }))).toEqual([
      { to: 'fernanda@mesa.com', replyTo: 'contato@mesa.com' },
    ]);
  });

  it('a test the SMTP refuses answers 502 MAIL_DELIVERY_FAILED and the draft stays untested', async () => {
    const id = await draft();
    mailer.failWith = new Error('connection refused');
    const response = await call('POST', `/admin/broadcasts/${id}/test`, admin.token);
    expect([response.statusCode, codeOf(response)]).toEqual([502, 'MAIL_DELIVERY_FAILED']);
    await turnOnTwoFactor(admin.id);
    const confirm = await call('POST', `/admin/broadcasts/${id}/confirm`, admin.token, {
      total: 3,
    });
    expect(codeOf(confirm)).toBe('TEST_REQUIRED');
  });

  it('confirming with the typed total freezes one delivery per account, in the same step', async () => {
    const id = await testedDraft();
    await turnOnTwoFactor(admin.id);
    const response = await call('POST', `/admin/broadcasts/${id}/confirm`, admin.token, {
      total: 3,
    });
    const body = mailBroadcastResponseDto.parse(response.json());
    expect(body.broadcast.total).toBe(3);
    expect(body.broadcast.confirmedAt).not.toBeNull();
    expect(await deliveriesOf(id)).toBe(3);
  });

  it('an account created after the confirmation is not in the frozen audience', async () => {
    const id = await testedDraft();
    await turnOnTwoFactor(admin.id);
    await call('POST', `/admin/broadcasts/${id}/confirm`, admin.token, { total: 3 });
    await account('Dani');
    expect(await deliveriesOf(id)).toBe(3);
  });

  it('a wrong typed total is 409 CONFIRMATION_MISMATCH and freezes nothing', async () => {
    const id = await testedDraft();
    await turnOnTwoFactor(admin.id);
    const response = await call('POST', `/admin/broadcasts/${id}/confirm`, admin.token, {
      total: 4,
    });
    expect([response.statusCode, codeOf(response)]).toEqual([409, 'CONFIRMATION_MISMATCH']);
    expect(await deliveriesOf(id)).toBe(0);
  });

  it('an admin without 2FA on is 403 TWO_FACTOR_REQUIRED', async () => {
    const id = await testedDraft();
    const response = await call('POST', `/admin/broadcasts/${id}/confirm`, admin.token, {
      total: 3,
    });
    expect([response.statusCode, codeOf(response)]).toEqual([403, 'TWO_FACTOR_REQUIRED']);
  });

  it('confirming twice is 409 ALREADY_CONFIRMED, and a confirmed notice cannot be rewritten', async () => {
    const id = await testedDraft();
    await turnOnTwoFactor(admin.id);
    await call('POST', `/admin/broadcasts/${id}/confirm`, admin.token, { total: 3 });
    const again = await call('POST', `/admin/broadcasts/${id}/confirm`, admin.token, { total: 3 });
    const rewrite = await call('PUT', `/admin/broadcasts/${id}`, admin.token, NOTICE);
    expect([again.statusCode, codeOf(again)]).toEqual([409, 'ALREADY_CONFIRMED']);
    expect([rewrite.statusCode, codeOf(rewrite)]).toEqual([409, 'ALREADY_CONFIRMED']);
    expect(await deliveriesOf(id)).toBe(3);
  });

  it('rewriting a tested draft forgets the test', async () => {
    const id = await testedDraft();
    const response = await call('PUT', `/admin/broadcasts/${id}`, admin.token, {
      ...NOTICE,
      subject: 'Outro assunto',
    });
    const body = mailBroadcastDraftResponseDto.parse(response.json());
    expect(body.broadcast).toMatchObject({ subject: 'Outro assunto', testedAt: null });
  });

  it('the list brings the notice with its counts', async () => {
    const id = await testedDraft();
    const response = await call('GET', '/admin/broadcasts', admin.token);
    const body = mailBroadcastsResponseDto.parse(response.json());
    expect(body.broadcasts.map((item) => [item.id, item.sent, item.failed])).toEqual([[id, 0, 0]]);
  });

  it('an unknown broadcast is 404 BROADCAST_NOT_FOUND', async () => {
    const unknown = '00000000-0000-4000-8000-000000000000';
    const response = await call('POST', `/admin/broadcasts/${unknown}/test`, admin.token);
    expect([response.statusCode, codeOf(response)]).toEqual([404, 'BROADCAST_NOT_FOUND']);
  });

  it('a button link that is not https is 400', async () => {
    const body = { ...NOTICE, button: { label: 'Ver', href: 'http://x.com' } };
    const response = await call('POST', '/admin/broadcasts', admin.token, body);
    expect(response.statusCode).toBe(400);
  });

  it.each([
    ['GET', '/admin/broadcasts'],
    ['POST', '/admin/broadcasts'],
    ['POST', '/admin/broadcasts/preview'],
    ['POST', '/admin/broadcasts/audience'],
  ] as const)(
    '%s %s is 403 to an account that is not admin and 401 without a session',
    async (method, url) => {
      const forbidden = await call(method, url, ana.token, NOTICE);
      const anonymous = await call(method, url, undefined, NOTICE);
      expect([forbidden.statusCode, anonymous.statusCode]).toEqual([403, 401]);
    },
  );
});
