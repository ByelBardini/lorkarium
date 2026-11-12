import {
  ASSET_MAX_BYTES,
  assetResponseDto,
  sheetTemplateResponseDto,
  sheetWriteResponseDto,
  type AssetDto,
  type SheetDto,
} from '@lorkarium/contracts';
import { count } from 'drizzle-orm';
import type { LightMyRequestResponse } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { setAccountPlan } from '../support/account-plans';
import { assets } from '../../src/modules/assets/assets.po';
import { animatedGifOf, pngOf } from '../support/images';
import { envelope, send } from '../support/live-table';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();
// These tables create several templates: Ana's plan sets no limit here.
beforeEach(() => setAccountPlan(live.connection.db, live.ana.id, 'amigo_do_dono'));
const CODE = { files: [{ path: 'index.html', content: '<p></p>' }] };

async function sheetOf(
  extra: object = {},
  user: SignedInUser = live.ana,
  table: Table = live.vharn,
): Promise<SheetDto> {
  const templates = `/api/campaigns/${table.id}/sheet-templates`;
  const template = await live.http(user, { method: 'POST', url: templates, payload: CODE });
  const templateId = sheetTemplateResponseDto.parse(template.json()).template.id;
  const payload = { actionId: crypto.randomUUID(), templateId, name: 'Lyra', ...extra };
  const url = `/api/campaigns/${table.id}/sheets`;
  const response = await live.http(user, { method: 'POST', url, payload });
  expect(response.statusCode, response.body).toBe(201);
  return sheetWriteResponseDto.parse(response.json()).sheet;
}

/** Lyra's sheet: Bia's character holds it. */
function lyraSheet(extra: object = {}): Promise<SheetDto> {
  return sheetOf({ holder: { memberId: live.bia.id }, ...extra });
}

function sendTo(
  user: SignedInUser,
  sheet: Pick<SheetDto, 'id'>,
  payload: Buffer,
  options: Readonly<{ table?: Table; type?: string }> = {},
): Promise<LightMyRequestResponse> {
  const table = options.table ?? live.vharn;
  return live.http(user, {
    method: 'POST',
    url: `/api/campaigns/${table.id}/sheets/${sheet.id}/images`,
    headers: { 'content-type': options.type ?? 'image/png' },
    payload,
  });
}

async function sentImage(
  user: SignedInUser,
  sheet: SheetDto,
  table: Table = live.vharn,
): Promise<AssetDto> {
  const response = await sendTo(user, sheet, await pngOf(80, 40), { table });
  expect(response.statusCode, response.body).toBe(201);
  return assetResponseDto.parse(response.json()).asset;
}

const read = (user: SignedInUser, assetId: string): Promise<LightMyRequestResponse> =>
  live.http(user, { method: 'GET', url: `/api/assets/${assetId}` });

function expectHidden(response: LightMyRequestResponse): void {
  expect(response.statusCode).toBe(404);
  expect(response.json()).toMatchObject({ code: 'ASSET_NOT_FOUND' });
}

async function assetCount(): Promise<number> {
  const [row] = await live.connection.db.select({ total: count() }).from(assets);
  return row?.total ?? 0;
}

describe('POST /campaigns/:c/sheets/:s/images', () => {
  it("Bia sends a PNG to Lyra's sheet: 201, and she and Ana read it, never cached", async () => {
    const sheet = await lyraSheet();
    const asset = await sentImage(live.bia, sheet);

    for (const user of [live.bia, live.ana]) {
      const response = await read(user, asset.id);
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/png');
      expect(response.headers['cache-control']).toBe('private, no-store');
    }
  });

  it('an image of a table sheet is read by Caio, who only reads it', async () => {
    const asset = await sentImage(live.bia, await lyraSheet({ visibility: 'table' }));

    expect((await read(live.caio, asset.id)).statusCode).toBe(200);
  });

  it('an image of a sheet only for its controllers is ASSET_NOT_FOUND to Caio', async () => {
    const asset = await sentImage(live.bia, await lyraSheet());

    expectHidden(await read(live.caio, asset.id));
  });

  it('reading a table sheet does not open the image of another sheet Caio does not read', async () => {
    await lyraSheet({ name: 'Diário', visibility: 'table' });
    const asset = await sentImage(live.bia, await lyraSheet());

    expectHidden(await read(live.caio, asset.id));
  });

  it('the image of a deleted sheet is read by nobody, the master included', async () => {
    const sheet = await lyraSheet();
    const asset = await sentImage(live.bia, sheet);
    const url = `/api/campaigns/${live.vharn.id}/sheets/${sheet.id}`;
    const payload = { actionId: crypto.randomUUID() };
    expect((await live.http(live.ana, { method: 'DELETE', url, payload })).statusCode).toBe(204);

    expectHidden(await read(live.ana, asset.id));
    expectHidden(await read(live.bia, asset.id));
  });

  it('a side above 4096 px is cut to 4096, keeping the proportion', async () => {
    const response = await sendTo(live.bia, await lyraSheet(), await pngOf(5000, 100));

    expect(response.statusCode, response.body).toBe(201);
    expect(assetResponseDto.parse(response.json()).asset).toMatchObject({
      width: 4096,
      height: 82,
    });
  });

  it('a GIF is decoded and refused: 422 UNSUPPORTED_IMAGE', async () => {
    const response = await sendTo(live.bia, await lyraSheet(), await animatedGifOf(3, 40), {
      type: 'image/gif',
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'UNSUPPORTED_IMAGE' });
  });

  it('an SVG has no parser: 415 UNSUPPORTED_IMAGE', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const response = await sendTo(live.bia, await lyraSheet(), svg, { type: 'image/svg+xml' });

    expect(response.statusCode).toBe(415);
    expect(response.json()).toMatchObject({ code: 'UNSUPPORTED_IMAGE' });
  });

  it('a body one byte above 20 MiB is 413 ASSET_TOO_LARGE', async () => {
    const response = await sendTo(live.bia, await lyraSheet(), Buffer.alloc(ASSET_MAX_BYTES + 1));

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ code: 'ASSET_TOO_LARGE' });
  });

  it('Caio only reads the table sheet: 403 even for a body above 20 MiB (never read)', async () => {
    const sheet = await lyraSheet({ visibility: 'table' });
    const before = await assetCount();

    const small = await sendTo(live.caio, sheet, await pngOf(20, 10));
    const huge = await sendTo(live.caio, sheet, Buffer.alloc(ASSET_MAX_BYTES + 1));

    expect(small.statusCode).toBe(403);
    expect(small.json()).toMatchObject({ code: 'FORBIDDEN' });
    expect(huge.statusCode).toBe(403);
    expect(await assetCount()).toBe(before);
  });

  it('Caio does not read the sheet: 404 SHEET_NOT_FOUND and nothing kept', async () => {
    const sheet = await lyraSheet();
    const before = await assetCount();

    const response = await sendTo(live.caio, sheet, await pngOf(20, 10));

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'SHEET_NOT_FOUND' });
    expect(await assetCount()).toBe(before);
  });

  it("Quelm's sheet image is not read by Vharn's master, nor sent through Vharn", async () => {
    const quelmSheet = await sheetOf({ name: 'Covil' }, live.caio, live.quelm);
    const asset = await sentImage(live.caio, quelmSheet, live.quelm);

    expectHidden(await read(live.ana, asset.id));
    expectHidden(await read(live.bia, asset.id));
    const throughVharn = await sendTo(live.ana, quelmSheet, await pngOf(20, 10));
    expect(throughVharn.statusCode).toBe(404);
    expect(throughVharn.json()).toMatchObject({ code: 'SHEET_NOT_FOUND' });
  });

  it('a malformed sheet id is 404 SHEET_NOT_FOUND', async () => {
    const response = await sendTo(live.bia, { id: 'not-a-uuid' }, await pngOf(20, 10));

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'SHEET_NOT_FOUND' });
  });

  it('without a session it is 401', async () => {
    const response = await live.http(null, {
      method: 'POST',
      url: `/api/campaigns/${live.vharn.id}/sheets/${crypto.randomUUID()}/images`,
      headers: { 'content-type': 'image/png' },
      payload: await pngOf(20, 10),
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('a sheet image outside its route', () => {
  it.each(['', '/import'])(
    'the generic POST /assets%s with purpose sheet_image is 403, before any image is kept',
    async (suffix) => {
      const before = await assetCount();
      const url = `/api/campaigns/${live.vharn.id}/assets${suffix}`;
      const response =
        suffix === ''
          ? await live.http(live.ana, {
              method: 'POST',
              url: `${url}?purpose=sheet_image`,
              headers: { 'content-type': 'image/png' },
              payload: await pngOf(20, 10),
            })
          : await live.http(live.ana, {
              method: 'POST',
              url,
              payload: { url: 'https://example.com/a.png', purpose: 'sheet_image' },
            });

      expect(response.statusCode).toBe(403);
      expect(await assetCount()).toBe(before);
    },
  );

  it('cannot become the art of a token, the background of a grid or a cover', async () => {
    const asset = await sentImage(live.ana, await lyraSheet());
    const master = await live.atTable(live.ana, live.vharn);
    const token = tokenCommandFor(live.vharn, live.ana.id, { imageAssetId: asset.id });
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
    const cover = await live.http(live.ana, {
      method: 'PATCH',
      url: `/api/campaigns/${live.vharn.id}`,
      payload: { cover: { kind: 'image', assetId: asset.id } },
    });
    expect(cover.statusCode).toBe(400);
  });
});
