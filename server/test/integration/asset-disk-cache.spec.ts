import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  apiErrorDto,
  assetResponseDto,
  campaignResponseDto,
  profileResponseDto,
} from '@lorkarium/contracts';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { S3AssetStorage } from '../../src/infrastructure/asset-storage/s3-asset-storage';
import { pngOf } from '../support/images';
import { signUpAndLogin, type SignedInUser } from '../support/sign-in';
import { createTable, joinByCode } from '../support/tables';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const MIB = 1024 * 1024;

type Request = Readonly<{
  method: 'GET' | 'POST' | 'PUT';
  url: string;
  payload?: object | Buffer;
  contentType?: string;
}>;

const fileOf = (key: string): string => createHash('sha256').update(key).digest('hex');

describe('asset disk cache behind the permission check', () => {
  const baseEnv: Env = { ...readEnv(process.env), adminSeed: null };
  const bucket = new S3AssetStorage(baseEnv.storage);
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let dir: string;
  let ana: SignedInUser;
  let bia: SignedInUser;
  let caio: SignedInUser;
  let vharnId: string;
  let png: Buffer;

  beforeAll(async () => {
    connection = await openTestDatabase();
    png = await pngOf(64, 48);
  });

  afterAll(async () => {
    bucket.destroy();
    await connection.close();
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    dir = await mkdtemp(path.join(tmpdir(), 'lorkarium-asset-cache-'));
    app = await buildApp({
      env: { ...baseEnv, assetCache: { dir, maxBytes: 64 * MIB } },
      db: connection.db,
    });
    ana = await signUpAndLogin(app, connection.db, 'Ana');
    bia = await signUpAndLogin(app, connection.db, 'Bia');
    caio = await signUpAndLogin(app, connection.db, 'Caio');
    const vharn = await createTable(app, ana, 'Os Sinos de Vharn');
    vharnId = vharn.id;
    await joinByCode(app, bia, vharn);
  });

  afterEach(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  function call(user: SignedInUser, request: Request): Promise<LightMyRequestResponse> {
    const headers = request.contentType ? { 'content-type': request.contentType } : {};
    const { method, payload } = request;
    const cookies = { lk_session: user.token };
    return app.inject({ method, url: `/api${request.url}`, cookies, headers, payload });
  }

  async function upload(user: SignedInUser, purpose: string, campaignId = vharnId) {
    const url = `/campaigns/${campaignId}/assets?purpose=${purpose}`;
    const response = await call(user, {
      method: 'POST',
      url,
      payload: png,
      contentType: 'image/png',
    });
    expect(response.statusCode, response.body).toBe(201);
    return assetResponseDto.parse(response.json()).asset.id;
  }

  const read = (user: SignedInUser, assetId: string) =>
    call(user, { method: 'GET', url: `/assets/${assetId}` });

  const codeOf = (response: LightMyRequestResponse): string =>
    apiErrorDto.parse(response.json()).code;

  it('serves an image from the disk once the object is gone from the bucket', async () => {
    const assetId = await upload(ana, 'token');
    const first = await read(ana, assetId);

    await bucket.remove(`assets/${assetId}`);
    const second = await read(ana, assetId);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.rawPayload.equals(first.rawPayload)).toBe(true);
  });

  it('keeps a cached image of one table out of reach of a member of only another table', async () => {
    const assetId = await upload(ana, 'token');
    expect((await read(ana, assetId)).statusCode).toBe(200);
    const quelm = await call(caio, {
      method: 'POST',
      url: '/campaigns',
      payload: { name: 'Quelm' },
    });
    expect(campaignResponseDto.safeParse(quelm.json()).success).toBe(true);

    const stranger = await read(caio, assetId);

    expect(stranger.statusCode).toBe(404);
    expect(codeOf(stranger)).toBe('ASSET_NOT_FOUND');
  });

  it('never hands a player the bytes of a private library image the master already opened', async () => {
    const assetId = await upload(ana, 'library_image');
    expect((await read(ana, assetId)).statusCode).toBe(200);

    const player = await read(bia, assetId);

    expect(player.statusCode).toBe(404);
    expect(codeOf(player)).toBe('ASSET_NOT_FOUND');
  });

  it('drops the old profile photo from the disk when the photo is replaced', async () => {
    const send = () =>
      call(ana, { method: 'PUT', url: '/account/avatar', payload: png, contentType: 'image/png' });
    const oldId = profileResponseDto.parse((await send()).json()).profile.avatarId;
    expect((await readdir(dir)).some((name) => name.startsWith(fileOf(`avatars/${oldId}`)))).toBe(
      true,
    );

    await send();

    const names = await readdir(dir);
    expect(names.some((name) => name.startsWith(fileOf(`avatars/${oldId}`)))).toBe(false);
  });

  it('without ASSET_CACHE_DIR reads straight from the bucket, so a removed object is a 404', async () => {
    await app.close();
    app = await buildApp({ env: { ...baseEnv, assetCache: null }, db: connection.db });
    ana = await signUpAndLogin(app, connection.db, 'Ana2');
    const vharn = await createTable(app, ana, 'Sem cache');
    const assetId = await upload(ana, 'token', vharn.id);
    expect((await read(ana, assetId)).statusCode).toBe(200);

    await bucket.remove(`assets/${assetId}`);

    expect((await read(ana, assetId)).statusCode).toBe(404);
    expect(await readdir(dir)).toStrictEqual([]);
  });
});
