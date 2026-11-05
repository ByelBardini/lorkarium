import { apiErrorDto, assetOutlineResponseDto, assetResponseDto } from '@lorkarium/contracts';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { AssetsDao } from '../../src/modules/assets/assets.dao';
import { newAssetPo } from '../support/assets-factories';
import { pngOf } from '../support/images';
import { signUpAndLogin, type SignedInUser } from '../support/sign-in';
import { createTable, joinByCode, type Table } from '../support/tables';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const MISSING_ID = 'd9e8f7a6-b5c4-4d3e-8f2a-1b0c9d8e7f6a';
const CUT_OUT_CORNERS = [
  [0.25, 0.25],
  [0.25, 0.75],
  [0.75, 0.25],
  [0.75, 0.75],
];

// 100×100 and transparent, but for an opaque 50×50 square in the middle.
async function cutOutPng(): Promise<Buffer> {
  const clear = { r: 0, g: 0, b: 0, alpha: 0 };
  const opaque = { r: 200, g: 80, b: 40, alpha: 1 };
  const square = await sharp({
    create: { width: 50, height: 50, channels: 4, background: opaque },
  })
    .png()
    .toBuffer();
  return sharp({ create: { width: 100, height: 100, channels: 4, background: clear } })
    .composite([{ input: square, left: 25, top: 25 }])
    .png()
    .toBuffer();
}

describe('GET /api/assets/:assetId/outline', () => {
  const env: Env = { ...readEnv(process.env), adminSeed: null };
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let ana: SignedInUser;
  let bia: SignedInUser;
  let caio: SignedInUser;
  let quelmMaster: SignedInUser;
  let vharn: Table;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    app = await buildApp({ env, db: connection.db });
    ana = await signUpAndLogin(app, connection.db, 'Ana');
    bia = await signUpAndLogin(app, connection.db, 'Bia');
    caio = await signUpAndLogin(app, connection.db, 'Caio');
    quelmMaster = await signUpAndLogin(app, connection.db, 'Duda');
    vharn = await createTable(app, ana, 'Os Sinos de Vharn');
    await joinByCode(app, bia, vharn);
    await joinByCode(app, caio, vharn);
  });

  afterEach(() => app.close());

  async function send(user: SignedInUser, bytes: Buffer, purpose: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${vharn.id}/assets?purpose=${purpose}`,
      cookies: { lk_session: user.token },
      headers: { 'content-type': 'image/png' },
      payload: bytes,
    });
    if (response.statusCode !== 201) throw new Error(`upload answered ${response.body}`);
    return assetResponseDto.parse(response.json()).asset.id;
  }

  function readOutline(user: SignedInUser | null, id: string): Promise<LightMyRequestResponse> {
    const cookies: Record<string, string> = user ? { lk_session: user.token } : {};
    return app.inject({ method: 'GET', url: `/api/assets/${id}/outline`, cookies });
  }

  function cornersOf(response: LightMyRequestResponse): number[][] {
    const { outline } = assetOutlineResponseDto.parse(response.json());
    const points = (outline?.[0] ?? []).map(([x, y]) => [x, y]);
    return points.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0) || (a[1] ?? 0) - (b[1] ?? 0));
  }

  it('Bia sends a cut-out PNG and Caio reads its polygon, cached as immutable', async () => {
    const id = await send(bia, await cutOutPng(), 'token');

    const response = await readOutline(caio, id);

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect(cornersOf(response)).toEqual(CUT_OUT_CORNERS);
  });

  it('an old row with no outline and no S3 object answers a null outline', async () => {
    const dao = new AssetsDao(connection.db);
    const { id } = await dao.insert(newAssetPo({ campaignId: vharn.id }));

    const response = await readOutline(bia, id);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ outline: null });
  });

  it('an aura image was never traced: its outline is null', async () => {
    const id = await send(bia, await cutOutPng(), 'aura');

    expect((await readOutline(bia, id)).json()).toEqual({ outline: null });
  });

  it('a token that came out fully transparent answers an empty list', async () => {
    const clear = { r: 0, g: 0, b: 0, alpha: 0 };
    const empty = await sharp({ create: { width: 32, height: 32, channels: 4, background: clear } })
      .png()
      .toBuffer();
    const id = await send(bia, empty, 'token');

    expect((await readOutline(caio, id)).json()).toEqual({ outline: [] });
  });

  it('without a session the read is 401', async () => {
    const id = await send(bia, await pngOf(32, 32), 'token');

    expect((await readOutline(null, id)).statusCode).toBe(401);
  });

  it('a malformed id is 404 ASSET_NOT_FOUND', async () => {
    const response = await readOutline(bia, 'not-a-uuid');

    expect(response.statusCode).toBe(404);
    expect(apiErrorDto.parse(response.json()).code).toBe('ASSET_NOT_FOUND');
  });

  it('an id that does not exist is 404 ASSET_NOT_FOUND', async () => {
    const response = await readOutline(bia, MISSING_ID);

    expect(response.statusCode).toBe(404);
    expect(apiErrorDto.parse(response.json()).code).toBe('ASSET_NOT_FOUND');
  });

  it('the master of Quelm does not read the outline of an asset of Vharn', async () => {
    await createTable(app, quelmMaster, 'Quelm');
    const id = await send(bia, await cutOutPng(), 'token');

    const response = await readOutline(quelmMaster, id);

    expect(response.statusCode).toBe(404);
    expect(apiErrorDto.parse(response.json()).code).toBe('ASSET_NOT_FOUND');
  });

  it('a player does not learn a private library image exists through its outline', async () => {
    const id = await send(ana, await pngOf(32, 32), 'library_image');

    const response = await readOutline(bia, id);

    expect(response.statusCode).toBe(404);
    expect(apiErrorDto.parse(response.json()).code).toBe('ASSET_NOT_FOUND');
  });

  it('the master reads the null outline of a private library image', async () => {
    const id = await send(ana, await pngOf(32, 32), 'library_image');

    expect((await readOutline(ana, id)).json()).toEqual({ outline: null });
  });
});
