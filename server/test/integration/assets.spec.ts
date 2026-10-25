import { apiErrorDto, assetResponseDto, campaignResponseDto } from '@lorkarium/contracts';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { animatedGifOf, pngOf } from '../support/images';
import { signUpAndLogin } from '../support/sign-in';
import { createTable, joinAsSpectator, joinByCode, type Table } from '../support/tables';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const MIB = 1024 * 1024;

describe('assets HTTP edge', () => {
  const env: Env = { ...readEnv(process.env), adminSeed: null };
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let ana: string;
  let bia: string;
  let caio: string;
  let vharn: Table;
  let vharnId: string;
  let quelmId: string;
  let smallPng: Buffer;

  beforeAll(async () => {
    connection = await openTestDatabase();
    smallPng = await pngOf(64, 48);
  });

  afterAll(() => connection.close());

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    app = await buildApp({ env, db: connection.db });
    const anaUser = await signUpAndLogin(app, connection.db, 'Ana');
    const biaUser = await signUpAndLogin(app, connection.db, 'Bia');
    ana = anaUser.token;
    bia = biaUser.token;
    caio = (await signUpAndLogin(app, connection.db, 'Caio')).token;
    vharn = await createTable(app, anaUser, 'Os Sinos de Vharn');
    vharnId = vharn.id;
    await joinByCode(app, biaUser, vharn);
    quelmId = (await createCampaign(caio, 'Quelm')).id;
  });

  afterEach(() => app.close());

  type Request = Readonly<{
    method: 'GET' | 'POST';
    url: string;
    payload?: object | Buffer | string;
    contentType?: string;
  }>;

  function call(token: string | undefined, request: Request): Promise<LightMyRequestResponse> {
    const cookies: Record<string, string> = token ? { lk_session: token } : {};
    const headers = request.contentType ? { 'content-type': request.contentType } : {};
    const { method, payload } = request;
    return app.inject({ method, url: `/api${request.url}`, cookies, headers, payload });
  }

  async function createCampaign(token: string, name: string) {
    const response = await call(token, { method: 'POST', url: '/campaigns', payload: { name } });
    return campaignResponseDto.parse(response.json()).campaign;
  }

  function upload(
    token: string | undefined,
    bytes: Buffer,
    options: { purpose?: string; type?: string; campaignId?: string } = {},
  ) {
    const url = `/campaigns/${options.campaignId ?? vharnId}/assets?purpose=${options.purpose ?? 'token'}`;
    return call(token, {
      method: 'POST',
      url,
      payload: bytes,
      contentType: options.type ?? 'image/png',
    });
  }

  function codeOf(response: LightMyRequestResponse): string {
    return apiErrorDto.parse(response.json()).code;
  }

  it('the master sends a PNG and gets the asset with its pixels', async () => {
    const response = await upload(ana, smallPng);

    expect(response.statusCode).toBe(201);
    expect(assetResponseDto.parse(response.json()).asset).toMatchObject({
      mimeType: 'image/png',
      width: 64,
      height: 48,
    });
  });

  it('a player of the table sends an image too', async () => {
    expect((await upload(bia, smallPng)).statusCode).toBe(201);
  });

  it('a member reads the image back with its type, a year of private cache and nosniff', async () => {
    const asset = assetResponseDto.parse((await upload(ana, smallPng)).json()).asset;

    const response = await call(bia, { method: 'GET', url: `/assets/${asset.id}` });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect((await sharp(response.rawPayload).metadata()).width).toBe(64);
  });

  it('a 3000×3000 token image is kept at 1024×1024', async () => {
    const response = await upload(ana, await pngOf(3000, 3000));

    expect(assetResponseDto.parse(response.json()).asset).toMatchObject({
      width: 1024,
      height: 1024,
    });
  });

  it('a member of Quelm reading an image of Vharn gets 404 ASSET_NOT_FOUND', async () => {
    const asset = assetResponseDto.parse((await upload(ana, smallPng)).json()).asset;

    const response = await call(caio, { method: 'GET', url: `/assets/${asset.id}` });

    expect(response.statusCode).toBe(404);
    expect(codeOf(response)).toBe('ASSET_NOT_FOUND');
  });

  it('without a session the send and the read are 401', async () => {
    expect((await upload(undefined, smallPng)).statusCode).toBe(401);
    const read = await call(undefined, { method: 'GET', url: `/assets/${crypto.randomUUID()}` });
    expect(read.statusCode).toBe(401);
  });

  it('someone outside the table sending to it gets 404 CAMPAIGN_NOT_FOUND', async () => {
    const response = await upload(caio, smallPng);

    expect(response.statusCode).toBe(404);
    expect(codeOf(response)).toBe('CAMPAIGN_NOT_FOUND');
  });

  // Contract change (aura plan, 2026-10-25): image/gif now has a parser, so a GIF that is not for
  // an aura is decoded and refused by the processor (422), no longer turned away as a type (415).
  it('a GIF sent as a token is 422 UNSUPPORTED_IMAGE: GIF is only for an aura', async () => {
    const response = await upload(ana, await animatedGifOf(3, 32), { type: 'image/gif' });

    expect(response.statusCode).toBe(422);
    expect(codeOf(response)).toBe('UNSUPPORTED_IMAGE');
  });

  it('an SVG content type is still 415 UNSUPPORTED_IMAGE', async () => {
    const response = await upload(ana, smallPng, { type: 'image/svg+xml' });

    expect(response.statusCode).toBe(415);
    expect(codeOf(response)).toBe('UNSUPPORTED_IMAGE');
  });

  it('text sent as image/png is 422 UNSUPPORTED_IMAGE', async () => {
    const response = await upload(ana, Buffer.from('<html>not an image</html>'));

    expect(response.statusCode).toBe(422);
    expect(codeOf(response)).toBe('UNSUPPORTED_IMAGE');
  });

  it('a body above 20 MiB is 413 ASSET_TOO_LARGE', async () => {
    const response = await upload(ana, Buffer.alloc(20 * MIB + 1));

    expect(response.statusCode).toBe(413);
    expect(codeOf(response)).toBe('ASSET_TOO_LARGE');
  });

  it('a link to the loopback is 422 LINK_BLOCKED (the real policy is wired)', async () => {
    const response = await call(ana, {
      method: 'POST',
      url: `/campaigns/${vharnId}/assets/import`,
      payload: { url: 'http://127.0.0.1/a.png', purpose: 'token' },
    });

    expect(response.statusCode).toBe(422);
    expect(codeOf(response)).toBe('LINK_BLOCKED');
  });

  it('an ftp link is 400 INVALID_BODY', async () => {
    const response = await call(ana, {
      method: 'POST',
      url: `/campaigns/${vharnId}/assets/import`,
      payload: { url: 'ftp://x.com/a.png', purpose: 'token' },
    });

    expect(response.statusCode).toBe(400);
    expect(codeOf(response)).toBe('INVALID_BODY');
  });

  it('the 21st send in a minute is 429 RATE_LIMITED with the seconds to wait', async () => {
    for (let sent = 0; sent < 20; sent += 1) {
      expect((await upload(ana, smallPng)).statusCode).toBe(201);
    }

    const response = await upload(ana, smallPng);

    expect(response.statusCode).toBe(429);
    const error = apiErrorDto.parse(response.json());
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('an image sent to Quelm by its master is not readable by Vharn', async () => {
    const asset = assetResponseDto.parse(
      (await upload(caio, smallPng, { campaignId: quelmId })).json(),
    ).asset;

    expect((await call(ana, { method: 'GET', url: `/assets/${asset.id}` })).statusCode).toBe(404);
  });

  describe('with purpose=condition', () => {
    it('a 600×300 PNG is kept as a 256×256 square', async () => {
      const response = await upload(ana, await pngOf(600, 300), { purpose: 'condition' });

      expect(response.statusCode).toBe(201);
      expect(assetResponseDto.parse(response.json()).asset).toMatchObject({
        mimeType: 'image/png',
        width: 256,
        height: 256,
      });
    });

    it('a GIF is 422 UNSUPPORTED_IMAGE', async () => {
      const gif = await sharp(await pngOf(32, 32))
        .gif()
        .toBuffer();

      const response = await upload(ana, gif, { purpose: 'condition', type: 'image/gif' });

      expect(response.statusCode).toBe(422);
      expect(codeOf(response)).toBe('UNSUPPORTED_IMAGE');
    });

    it('a spectator of the table is 403 FORBIDDEN', async () => {
      const duda = await signUpAndLogin(app, connection.db, 'Duda');
      await joinAsSpectator(app, duda, vharn);

      const response = await upload(duda.token, smallPng, { purpose: 'condition' });

      expect(response.statusCode).toBe(403);
      expect(codeOf(response)).toBe('FORBIDDEN');
    });

    it('a member of Quelm reading a condition image of Vharn gets 404 ASSET_NOT_FOUND', async () => {
      const sent = await upload(ana, smallPng, { purpose: 'condition' });
      const asset = assetResponseDto.parse(sent.json()).asset;

      const response = await call(caio, { method: 'GET', url: `/assets/${asset.id}` });

      expect(response.statusCode).toBe(404);
      expect(codeOf(response)).toBe('ASSET_NOT_FOUND');
    });
  });

  describe('with purpose=aura', () => {
    it('an animated GIF is 201 image/gif and is read back as image/gif with its frames', async () => {
      const sent = await upload(bia, await animatedGifOf(3, 64), {
        purpose: 'aura',
        type: 'image/gif',
      });
      expect(sent.statusCode).toBe(201);
      const asset = assetResponseDto.parse(sent.json()).asset;
      expect(asset).toMatchObject({ mimeType: 'image/gif', width: 64, height: 64 });

      const read = await call(ana, { method: 'GET', url: `/assets/${asset.id}` });

      expect(read.headers['content-type']).toBe('image/gif');
      expect((await sharp(read.rawPayload, { animated: true }).metadata()).pages).toBe(3);
    });

    it('a 900×900 PNG is kept at 512×512', async () => {
      const response = await upload(ana, await pngOf(900, 900), { purpose: 'aura' });

      expect(assetResponseDto.parse(response.json()).asset).toMatchObject({
        mimeType: 'image/png',
        width: 512,
        height: 512,
      });
    });

    it('a GIF of 121 frames is 422 UNSUPPORTED_IMAGE', async () => {
      const response = await upload(ana, await animatedGifOf(121, 8), {
        purpose: 'aura',
        type: 'image/gif',
      });

      expect(response.statusCode).toBe(422);
      expect(codeOf(response)).toBe('UNSUPPORTED_IMAGE');
    });

    it('an aura image of Quelm is not readable by a member of Vharn', async () => {
      const sent = await upload(caio, await animatedGifOf(2, 16), {
        purpose: 'aura',
        type: 'image/gif',
        campaignId: quelmId,
      });
      const asset = assetResponseDto.parse(sent.json()).asset;

      const response = await call(bia, { method: 'GET', url: `/assets/${asset.id}` });

      expect(response.statusCode).toBe(404);
      expect(codeOf(response)).toBe('ASSET_NOT_FOUND');
    });
  });
});
