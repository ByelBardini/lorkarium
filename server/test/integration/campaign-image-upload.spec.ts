import { apiErrorDto, assetResponseDto, type AssetDto } from '@lorkarium/contracts';
import { sql } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { pngOf } from '../support/images';
import { signUpAndLogin } from '../support/sign-in';
import { createTable, joinByCode, type Table } from '../support/tables';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const RED = { r: 220, g: 20, b: 20, alpha: 1 };
const BLUE = { r: 20, g: 20, b: 220, alpha: 1 };
const RIGHT_HALF = 'cropX=50&cropY=0&cropW=50&cropH=100';

// 1200 × 600: red on the left half, blue on the right one.
async function redLeftBlueRightPng(): Promise<Buffer> {
  const half = { width: 600, height: 600, channels: 4, background: BLUE } as const;
  const blue = await sharp({ create: half }).png().toBuffer();
  return sharp({ create: { width: 1200, height: 600, channels: 4, background: RED } })
    .composite([{ input: blue, left: 600, top: 0 }])
    .png()
    .toBuffer();
}

describe('campaign photo and banner upload', () => {
  const env: Env = { ...readEnv(process.env), adminSeed: null };
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let ana: string;
  let bia: string;
  let vharn: Table;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    app = await buildApp({ env, db: connection.db });
    const anaUser = await signUpAndLogin(app, connection.db, 'Ana');
    const biaUser = await signUpAndLogin(app, connection.db, 'Bia');
    ana = anaUser.token;
    bia = biaUser.token;
    vharn = await createTable(app, anaUser, 'Os Sinos de Vharn');
    await joinByCode(app, biaUser, vharn);
  });

  afterEach(() => app.close());

  function upload(token: string, bytes: Buffer, query: string): Promise<LightMyRequestResponse> {
    return app.inject({
      method: 'POST',
      url: `/api/campaigns/${vharn.id}/assets?${query}`,
      cookies: { lk_session: token },
      headers: { 'content-type': 'image/png' },
      payload: bytes,
    });
  }

  function assetOf(response: LightMyRequestResponse): AssetDto {
    expect(response.statusCode).toBe(201);
    return assetResponseDto.parse(response.json()).asset;
  }

  async function meanColourOf(assetId: string): Promise<{ red: number; blue: number }> {
    const read = await app.inject({
      method: 'GET',
      url: `/api/assets/${assetId}`,
      cookies: { lk_session: ana },
    });
    const { channels } = await sharp(read.rawPayload).stats();
    return { red: channels[0]?.mean ?? -1, blue: channels[2]?.mean ?? -1 };
  }

  it('a photo with the right half picked is kept as a 512 px square of that half', async () => {
    const response = await upload(
      ana,
      await redLeftBlueRightPng(),
      `purpose=campaign_photo&${RIGHT_HALF}`,
    );

    const asset = assetOf(response);
    expect(asset).toMatchObject({ width: 512, height: 512 });
    const colour = await meanColourOf(asset.id);
    expect(colour.blue).toBeGreaterThan(200);
    expect(colour.red).toBeLessThan(40);
  });

  it('a banner sent with no rectangle is cut 3:1 at the centre, up to 1800 × 600', async () => {
    const response = await upload(ana, await pngOf(3600, 1800), 'purpose=campaign_banner');

    expect(assetOf(response)).toMatchObject({ width: 1800, height: 600 });
  });

  it('a cover sent with no rectangle comes out 2:1', async () => {
    const response = await upload(ana, await pngOf(1000, 1000), 'purpose=cover');

    expect(assetOf(response)).toMatchObject({ width: 1000, height: 500 });
  });

  it('a rectangle sent with a token is 400 INVALID_BODY', async () => {
    const response = await upload(ana, await pngOf(64, 64), `purpose=token&${RIGHT_HALF}`);

    expect(response.statusCode).toBe(400);
    expect(apiErrorDto.parse(response.json()).code).toBe('INVALID_BODY');
  });

  it('a rectangle with only two of its fields is 400 INVALID_BODY', async () => {
    const response = await upload(ana, await pngOf(64, 64), 'purpose=cover&cropX=0&cropY=0');

    expect(response.statusCode).toBe(400);
    expect(apiErrorDto.parse(response.json()).code).toBe('INVALID_BODY');
  });

  it('a player sends a campaign photo too: only the settings decide who uses it', async () => {
    const response = await upload(bia, await pngOf(300, 300), 'purpose=campaign_photo');

    expect(assetOf(response)).toMatchObject({ width: 300, height: 300 });
  });

  it('the database knows the two new purposes of an asset', async () => {
    const result = await connection.db.execute<{ purpose: string }>(
      sql`select unnest(enum_range(null::asset_purpose))::text as purpose`,
    );

    const purposes = result.rows.map((row) => row.purpose);
    expect(purposes).toEqual(expect.arrayContaining(['campaign_photo', 'campaign_banner']));
  });
});
