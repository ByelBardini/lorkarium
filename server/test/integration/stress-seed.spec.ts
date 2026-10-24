import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { Argon2PasswordHasher } from '../../src/infrastructure/password-hasher/argon2-password-hasher';
import { DEV_PLAYER_PASSWORD } from '../../src/modules/auth/dev-players-seed.bo';
import { DevPlayersSeedService } from '../../src/modules/auth/dev-players-seed.service';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { buildStressSceneSeed } from '../../src/app/build-stress-seed';
import { atTable, synced } from '../support/live-table';
import type { RealtimeClient } from '../support/realtime-client';
import { logIn, testDataCipher } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

describe('the stress scene seed (pnpm db:seed-stress)', () => {
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let baseUrl = '';
  const clients: RealtimeClient[] = [];

  beforeAll(async () => {
    connection = await openTestDatabase();
  });
  afterAll(() => connection.close());
  beforeEach(async () => {
    await truncateAllTables(connection.db);
    await new DevPlayersSeedService({
      users: new UsersDao(connection.db),
      hasher: new Argon2PasswordHasher(),
      cipher: testDataCipher(),
      newId: randomUUID,
    }).seed('test');
    app = await buildApp({ env: { ...readEnv(process.env), adminSeed: null }, db: connection.db });
    baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
  });
  afterEach(async () => {
    for (const client of clients.splice(0)) client.close();
    await app.close();
  });

  it('Caio joins the seeded table and board:sync brings the whole dark scene', async () => {
    const { campaignId, created } = await buildStressSceneSeed(connection.db).seed('test');
    const caio = await new UsersDao(connection.db).findByUsername('caio');
    const token = await logIn(app, 'caio@lorkarium.dev', DEV_PLAYER_PASSWORD);
    const client = await atTable(
      baseUrl,
      clients,
      { id: caio?.id ?? '', token },
      { id: campaignId },
    );

    const board = await synced(client, { id: campaignId });

    expect(created).toBe(true);
    expect(board.scene).toMatchObject({ widthCells: 100, heightCells: 100, vision: 'dark' });
    expect(board.tokens).toHaveLength(300);
    expect(board.walls).toHaveLength(300);
    expect(board.lights).toHaveLength(40);
    expect(board.tokens.filter(({ canControl }) => canControl)).toHaveLength(2);
  }, 60_000);

  it('a second run finds the table and creates nothing', async () => {
    const seed = buildStressSceneSeed(connection.db);
    const first = await seed.seed('test');
    const second = await seed.seed('test');
    expect(second).toEqual({ campaignId: first.campaignId, created: false });
  }, 60_000);
});
