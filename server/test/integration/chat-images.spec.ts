import { PLAN_LIMITS, apiErrorDto, assetResponseDto, type AssetDto } from '@lorkarium/contracts';
import { randomUUID } from 'node:crypto';
import { count, eq } from 'drizzle-orm';
import type { LightMyRequestResponse } from 'fastify';
import { describe, expect, it } from 'vitest';
import { assets } from '../../src/modules/assets/assets.po';
import { newAssetPo } from '../support/assets-factories';
import { ImageFetcherFake } from '../support/assets-fakes';
import { animatedGifOf, pngOf } from '../support/images';
import { envelope, send } from '../support/live-table';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { tokenCommandFor, useTokenTable } from '../support/token-table';

// Ana owns Vharn (Bia and Caio play there); Caio owns Quelm. The link of Ctrl+I goes through a
// fake fetcher: the SSRF guard itself is proven in guarded-image-fetcher.spec.ts.
const fetcher = new ImageFetcherFake();
const live = useTokenTable(undefined, fetcher);
const MIB = 1024 * 1024;

function sendChatImage(
  user: SignedInUser,
  payload: Buffer,
  options: Readonly<{ table?: Table; type?: string }> = {},
): Promise<LightMyRequestResponse> {
  const table = options.table ?? live.vharn;
  return live.http(user, {
    method: 'POST',
    url: `/api/campaigns/${table.id}/assets?purpose=chat_image`,
    headers: { 'content-type': options.type ?? 'image/png' },
    payload,
  });
}

function importChatImage(user: SignedInUser, url: string): Promise<LightMyRequestResponse> {
  return live.http(user, {
    method: 'POST',
    url: `/api/campaigns/${live.vharn.id}/assets/import`,
    payload: { url, purpose: 'chat_image' },
  });
}

async function chatImageOf(user: SignedInUser, table: Table = live.vharn): Promise<AssetDto> {
  const response = await sendChatImage(user, await pngOf(80, 40), { table });
  expect(response.statusCode, response.body).toBe(201);
  return assetResponseDto.parse(response.json()).asset;
}

const read = (user: SignedInUser, assetId: string): Promise<LightMyRequestResponse> =>
  live.http(user, { method: 'GET', url: `/api/assets/${assetId}` });

async function spectator(): Promise<SignedInUser> {
  const duda = await live.signUp('Duda');
  await live.joinAsSpectator(duda, live.vharn);
  return duda;
}

function codeOf(response: LightMyRequestResponse): string {
  return apiErrorDto.parse(response.json()).code;
}

async function assetCount(): Promise<number> {
  const [row] = await live.connection.db.select({ total: count() }).from(assets);
  return row?.total ?? 0;
}

describe('sending a chat image', () => {
  it('Bia sends a PNG: 201, kept up to 2048 px, and Caio reads it never cached', async () => {
    const response = await sendChatImage(live.bia, await pngOf(3000, 1500));
    expect(response.statusCode, response.body).toBe(201);
    const asset = assetResponseDto.parse(response.json()).asset;
    expect(asset).toMatchObject({ width: 2048, height: 1024 });

    const opened = await read(live.caio, asset.id);
    expect(opened.statusCode).toBe(200);
    expect(opened.headers['cache-control']).toBe('private, no-cache');
  }, 30_000);

  it('an animated GIF stays animated', async () => {
    const response = await sendChatImage(live.bia, await animatedGifOf(3, 32), {
      type: 'image/gif',
    });

    expect(response.statusCode, response.body).toBe(201);
    expect(assetResponseDto.parse(response.json()).asset.mimeType).toBe('image/gif');
  });

  it('a spectator sends one too, though they send no other image', async () => {
    const duda = await spectator();

    expect((await sendChatImage(duda, await pngOf(20, 20))).statusCode).toBe(201);
  });

  it('Bia imports one by link (Ctrl+I): 201 chat_image', async () => {
    fetcher.refusal = null;
    fetcher.answer = { bytes: await pngOf(60, 30), contentType: 'image/png' };

    const response = await importChatImage(live.bia, 'https://example.com/pista.png');

    expect(response.statusCode, response.body).toBe(201);
    expect(fetcher.fetched).toContain('https://example.com/pista.png');
    const [row] = await live.connection.db
      .select()
      .from(assets)
      .where(eq(assets.id, assetResponseDto.parse(response.json()).asset.id));
    expect(row?.purpose).toBe('chat_image');
  });

  it('a link that does not answer is 422 LINK_UNREACHABLE', async () => {
    fetcher.refusal = { kind: 'unreachable', reason: 'status 404' };

    const response = await importChatImage(live.bia, 'https://example.com/sumiu.png');

    expect([response.statusCode, codeOf(response)]).toEqual([422, 'LINK_UNREACHABLE']);
    fetcher.refusal = null;
  });

  it('a linked file above 10 MiB is 413 ASSET_TOO_LARGE', async () => {
    fetcher.refusal = null;
    fetcher.answer = { bytes: new Uint8Array(10 * MIB + 1), contentType: 'image/png' };

    const response = await importChatImage(live.bia, 'https://example.com/grande.png');

    expect([response.statusCode, codeOf(response)]).toEqual([413, 'ASSET_TOO_LARGE']);
  });

  it('a file above 10 MiB is 413 ASSET_TOO_LARGE and an SVG is 415', async () => {
    const big = await sendChatImage(live.bia, Buffer.alloc(10 * MIB + 1));
    const svg = await sendChatImage(live.bia, Buffer.from('<svg/>'), { type: 'image/svg+xml' });

    expect([big.statusCode, codeOf(big)]).toEqual([413, 'ASSET_TOO_LARGE']);
    expect([svg.statusCode, codeOf(svg)]).toEqual([415, 'UNSUPPORTED_IMAGE']);
  });

  it('a free owner without room is 403 PLAN_LIMIT storage and nothing is kept', async () => {
    const id = randomUUID();
    const sizeBytes = (PLAN_LIMITS.free.maxStorageBytes ?? 0) - 10;
    const row = newAssetPo({ id, campaignId: live.vharn.id, sizeBytes, createdAt: new Date() });
    await live.connection.db.insert(assets).values({ ...row, storageKey: `assets/${id}` });
    const before = await assetCount();

    const response = await sendChatImage(live.bia, await pngOf(64, 64));

    expect(response.statusCode).toBe(403);
    expect(apiErrorDto.parse(response.json()).planLimit).toMatchObject({ resource: 'storage' });
    expect(await assetCount()).toBe(before);
  });
});

describe('who reads a chat image', () => {
  it('a member only of Quelm reads none of Vharn and sends none to it', async () => {
    const asset = await chatImageOf(live.bia);
    const outsider = await live.signUp('Eli');

    expect([(await read(outsider, asset.id)).statusCode]).toEqual([404]);
    const sent = await sendChatImage(outsider, await pngOf(20, 20));
    expect([sent.statusCode, codeOf(sent)]).toEqual([404, 'CAMPAIGN_NOT_FOUND']);
  });

  it("Ana and Bia, who do not play in Quelm, read none of Quelm's chat images", async () => {
    const quelmImage = await chatImageOf(live.caio, live.quelm);

    expect((await read(live.ana, quelmImage.id)).statusCode).toBe(404);
    expect((await read(live.bia, quelmImage.id)).statusCode).toBe(404);
  });

  it('cannot become the art of a token or the background of a grid', async () => {
    const asset = await chatImageOf(live.ana);
    const master = await live.atTable(live.ana, live.vharn);
    const token = tokenCommandFor(live.vharn, live.ana.id, { bars: [], imageAssetId: asset.id });
    const background = {
      ...envelope(live.vharn.id),
      widthCells: 30,
      heightCells: 20,
      cellDistance: 1.5,
      cellUnit: 'm',
      gridVisible: true,
      gridOpacity: 15,
      backgroundAssetId: asset.id,
    };
    const refused = { ok: false, error: { code: 'ASSET_NOT_FOUND' } };

    expect(await send(master, 'token:create', token)).toMatchObject(refused);
    expect(await send(master, 'scene:configure', background)).toMatchObject(refused);
  });
});
