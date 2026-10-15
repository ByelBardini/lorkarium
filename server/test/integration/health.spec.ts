import { apiErrorDto, healthResponseDto } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv } from '../../src/config/env';
import { createDatabase, type DatabaseConnection } from '../../src/database/database';
import { openTestDatabase } from '../support/test-database';

describe('GET /api/health', () => {
  const env = readEnv(process.env);
  let connection: DatabaseConnection;
  let app: FastifyInstance;

  beforeAll(async () => {
    connection = await openTestDatabase();
    app = await buildApp({ env, db: connection.db });
  });

  afterAll(async () => {
    await app.close();
    await connection.close();
  });

  it('with the database up and no session cookie it answers 200 with status ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(healthResponseDto.parse(response.json())).toEqual({ status: 'ok' });
  });

  it('with a closed database pool it answers 503 DATABASE_UNAVAILABLE without leaking the URL', async () => {
    const closed = createDatabase(env.databaseUrl);
    await closed.close();
    const brokenApp = await buildApp({ env, db: closed.db });
    const response = await brokenApp.inject({ method: 'GET', url: '/api/health' });
    await brokenApp.close();
    expect(response.statusCode).toBe(503);
    expect(apiErrorDto.parse(response.json()).code).toBe('DATABASE_UNAVAILABLE');
    expect(response.body).not.toContain(env.databaseUrl);
  });
});
