import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { MailerFake } from '../support/account-security-fakes';
import { openTestDatabase } from '../support/test-database';

describe('legal links', () => {
  let connection: DatabaseConnection;
  let app: FastifyInstance;

  beforeAll(async () => {
    connection = await openTestDatabase();
    const env = { ...readEnv(process.env), adminSeed: null, sitePublicUrl: 'https://example.com' };
    app = await buildApp({ env, db: connection.db, mailer: new MailerFake() });
  });

  afterAll(async () => {
    await app.close();
    await connection.close();
  });

  it.each([
    ['terms', 'https://example.com/termos/'],
    ['privacy', 'https://example.com/privacidade/'],
  ])('GET /api/legal/%s answers 302 to %s, without a session', async (document, landing) => {
    const response = await app.inject({ method: 'GET', url: `/api/legal/${document}` });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(landing);
  });

  it('a document that does not exist is 404', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/legal/cookies' });
    expect(response.statusCode).toBe(404);
  });
});
