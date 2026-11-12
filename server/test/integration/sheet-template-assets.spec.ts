import {
  sheetTemplateAssetResponseDto,
  sheetTemplateResponseDto,
  sheetWriteResponseDto,
  type SheetTemplateAssetDto,
  type SheetTemplateDto,
} from '@lorkarium/contracts';
import { count } from 'drizzle-orm';
import type { LightMyRequestResponse } from 'fastify';
import { describe, expect, it } from 'vitest';
import { assets } from '../../src/modules/assets/assets.po';
import { pngOf } from '../support/images';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();
const CODE = { files: [{ path: 'index.html', content: '<p></p>' }] };
// The four bytes every WOFF2 starts with ("wOF2"), then some of a real file's header.
const WOFF2 = Buffer.from([0x77, 0x4f, 0x46, 0x32, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00]);
const TTF = Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00, 0x0c, 0x00, 0x80, 0x00, 0x03, 0x00, 0x40]);

function sendAsset(
  user: SignedInUser,
  payload: Buffer,
  type = 'font/woff2',
  table: Table = live.vharn,
): Promise<LightMyRequestResponse> {
  return live.http(user, {
    method: 'POST',
    url: `/api/campaigns/${table.id}/sheet-template-assets`,
    headers: { 'content-type': type },
    payload,
  });
}

async function sentAsset(payload: Buffer = WOFF2, type?: string): Promise<SheetTemplateAssetDto> {
  const response = await sendAsset(live.ana, payload, type);
  expect(response.statusCode, response.body).toBe(201);
  return sheetTemplateAssetResponseDto.parse(response.json()).asset;
}

async function templateDeclaring(asset: SheetTemplateAssetDto): Promise<SheetTemplateDto> {
  const manifest = { assets: [{ path: 'fontes/cormorant.woff2', assetId: asset.id }] };
  const url = `/api/campaigns/${live.vharn.id}/sheet-templates`;
  const response = await live.http(live.ana, {
    method: 'POST',
    url,
    payload: { ...CODE, manifest },
  });
  expect(response.statusCode, response.body).toBe(201);
  return sheetTemplateResponseDto.parse(response.json()).template;
}

async function lyraSheetOf(template: SheetTemplateDto, visibility = 'controllers'): Promise<void> {
  const holder = { memberId: live.bia.id };
  const payload = {
    actionId: crypto.randomUUID(),
    templateId: template.id,
    name: 'Lyra',
    holder,
    visibility,
  };
  const url = `/api/campaigns/${live.vharn.id}/sheets`;
  const response = await live.http(live.ana, { method: 'POST', url, payload });
  expect(response.statusCode, response.body).toBe(201);
  sheetWriteResponseDto.parse(response.json());
}

const read = (user: SignedInUser, assetId: string): Promise<LightMyRequestResponse> =>
  live.http(user, { method: 'GET', url: `/api/assets/${assetId}` });

async function assetCount(): Promise<number> {
  const [row] = await live.connection.db.select({ total: count() }).from(assets);
  return row?.total ?? 0;
}

describe('POST /campaigns/:c/sheet-template-assets', () => {
  it('Ana sends a WOFF2 font: 201, kept as sent and read back as font/woff2, never cached', async () => {
    const font = await sentAsset();

    expect(font).toMatchObject({ mimeType: 'font/woff2', sizeBytes: WOFF2.byteLength });
    const response = await read(live.ana, font.id);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('font/woff2');
    expect(response.headers['cache-control']).toBe('private, no-cache');
    expect(response.rawPayload.equals(WOFF2)).toBe(true);
  });

  it('Ana sends a PNG: 201 as an image of the template', async () => {
    const image = await sentAsset(await pngOf(80, 40), 'image/png');

    expect(image.mimeType).toBe('image/png');
  });

  it('a TTF sent as .woff2 is 422 UNSUPPORTED_FONT and nothing is kept', async () => {
    const response = await sendAsset(live.ana, TTF);

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'UNSUPPORTED_FONT' });
    expect(await assetCount()).toBe(0);
  });

  it('a font over 2 MiB is 413 and an SVG is 415', async () => {
    const large = Buffer.concat([WOFF2, Buffer.alloc(2 * 1024 * 1024)]);
    expect((await sendAsset(live.ana, large)).statusCode).toBe(413);
    const svg = await sendAsset(live.ana, Buffer.from('<svg/>'), 'image/svg+xml');
    expect(svg.statusCode).toBe(415);
    expect(await assetCount()).toBe(0);
  });

  it('Bia, a player, is 403 before the body is read, and nothing is kept', async () => {
    const response = await sendAsset(live.bia, Buffer.alloc(9 * 1024 * 1024));

    expect(response.statusCode).toBe(403);
    expect(await assetCount()).toBe(0);
  });

  it('the generic asset route refuses the template purpose', async () => {
    const response = await live.http(live.ana, {
      method: 'POST',
      url: `/api/campaigns/${live.vharn.id}/assets?purpose=sheet_template_asset`,
      headers: { 'content-type': 'image/png' },
      payload: await pngOf(10, 10),
    });

    expect(response.statusCode).toBe(403);
    expect(await assetCount()).toBe(0);
  });
});

describe('who reads a template asset', () => {
  it("Bia reads the font of the template of Lyra's sheet; Caio, who reads no sheet of it, does not", async () => {
    const font = await sentAsset();
    await lyraSheetOf(await templateDeclaring(font));

    expect((await read(live.bia, font.id)).statusCode).toBe(200);
    const caio = await read(live.caio, font.id);
    expect(caio.statusCode).toBe(404);
    expect(caio.json()).toMatchObject({ code: 'ASSET_NOT_FOUND' });
  });

  it("Caio reads it once Lyra's sheet is the table's", async () => {
    const font = await sentAsset();
    await lyraSheetOf(await templateDeclaring(font), 'table');

    expect((await read(live.caio, font.id)).statusCode).toBe(200);
  });

  it('a font no template declares is read by Ana only', async () => {
    const font = await sentAsset();

    expect((await read(live.ana, font.id)).statusCode).toBe(200);
    expect((await read(live.bia, font.id)).statusCode).toBe(404);
  });

  it('deleting the template keeps the asset: Ana still reads it', async () => {
    const font = await sentAsset();
    const template = await templateDeclaring(font);
    const url = `/api/campaigns/${live.vharn.id}/sheet-templates/${template.id}`;
    expect((await live.http(live.ana, { method: 'DELETE', url })).statusCode).toBe(204);

    expect((await read(live.ana, font.id)).statusCode).toBe(200);
    expect(await assetCount()).toBe(1);
  });

  it('Caio, master of Quelm, neither reads a Vharn font nor declares it in a Quelm template', async () => {
    const font = await sentAsset();
    await lyraSheetOf(await templateDeclaring(font));
    const manifest = { assets: [{ path: 'fontes/x.woff2', assetId: font.id }] };
    const url = `/api/campaigns/${live.quelm.id}/sheet-templates`;

    const declared = await live.http(live.caio, {
      method: 'POST',
      url,
      payload: { ...CODE, manifest },
    });

    expect(declared.statusCode).toBe(404);
    expect(declared.json()).toMatchObject({ code: 'SHEET_TEMPLATE_ASSET_NOT_FOUND' });
    expect((await read(live.caio, font.id)).statusCode).toBe(404);
  });
});
