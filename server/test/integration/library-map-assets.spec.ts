import { assetResponseDto, type AssetDto } from '@lorkarium/contracts';
import type { LightMyRequestResponse } from 'fastify';
import { describe, expect, it } from 'vitest';
import { LibraryMapsDao } from '../../src/modules/library-maps/library-maps.dao';
import type { LibraryMapPo } from '../../src/modules/library-maps/library-maps.po';
import { setAccountPlan } from '../support/account-plans';
import { pngOf } from '../support/images';
import { newLibraryMapPo } from '../support/library-maps-factories';
import { envelope, send } from '../support/live-table';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();

function sendMapImage(
  user: SignedInUser,
  table: Table,
  payload: Buffer,
): Promise<LightMyRequestResponse> {
  return live.http(user, {
    method: 'POST',
    url: `/api/campaigns/${table.id}/assets?purpose=library_map`,
    headers: { 'content-type': 'image/png' },
    payload,
  });
}

async function mapImageOf(user: SignedInUser, table: Table): Promise<AssetDto> {
  const response = await sendMapImage(user, table, await pngOf(80, 40));
  expect(response.statusCode, response.body).toBe(201);
  return assetResponseDto.parse(response.json()).asset;
}

function mapOver(
  asset: AssetDto,
  overrides: Partial<LibraryMapPo> = {},
  table: Table = live.vharn,
): Promise<LibraryMapPo> {
  const row = newLibraryMapPo({ campaignId: table.id, assetId: asset.id, ...overrides });
  return new LibraryMapsDao(live.connection.db).insert(row);
}

const read = (user: SignedInUser, assetId: string): Promise<LightMyRequestResponse> =>
  live.http(user, { method: 'GET', url: `/api/assets/${assetId}` });

async function spectator(): Promise<SignedInUser> {
  const duda = await live.signUp('Duda');
  await live.joinAsSpectator(duda, live.vharn);
  return duda;
}

function expectHidden(response: LightMyRequestResponse): void {
  expect(response.statusCode).toBe(404);
  expect(response.json()).toMatchObject({ code: 'ASSET_NOT_FOUND' });
}

describe('the image of a library map', () => {
  it('is cut to 8192 px on its largest side, keeping the proportion', async () => {
    // The free plan keeps 4096 px (assets-plan-limit.spec.ts); the technical side needs more.
    await setAccountPlan(live.connection.db, live.ana.id, 'narrador');
    const response = await sendMapImage(live.ana, live.vharn, await pngOf(10000, 5000));

    expect(response.statusCode, response.body).toBe(201);
    expect(assetResponseDto.parse(response.json()).asset).toMatchObject({
      width: 8192,
      height: 4096,
    });
  }, 30_000);

  it('the master reads a private map, and the answer is never cached', async () => {
    const asset = await mapImageOf(live.ana, live.vharn);
    await mapOver(asset);

    const response = await read(live.ana, asset.id);

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-cache');
  });

  it('a player and a spectator read a public map', async () => {
    const asset = await mapImageOf(live.ana, live.vharn);
    await mapOver(asset, { visibility: 'public' });

    expect((await read(live.bia, asset.id)).statusCode).toBe(200);
    expect((await read(await spectator(), asset.id)).statusCode).toBe(200);
  });

  it('a player and a spectator read the main map even when it is private', async () => {
    const asset = await mapImageOf(live.ana, live.vharn);
    await mapOver(asset, { isMain: true });

    expect((await read(live.bia, asset.id)).statusCode).toBe(200);
    expect((await read(await spectator(), asset.id)).statusCode).toBe(200);
  });

  it('a private map answers ASSET_NOT_FOUND to a player and to a spectator', async () => {
    const asset = await mapImageOf(live.ana, live.vharn);
    await mapOver(asset);

    expectHidden(await read(live.bia, asset.id));
    expectHidden(await read(await spectator(), asset.id));
  });

  it('a map that stops being the main one is refused on the next read', async () => {
    const asset = await mapImageOf(live.ana, live.vharn);
    await mapOver(asset, { isMain: true });
    expect((await read(live.bia, asset.id)).statusCode).toBe(200);

    await new LibraryMapsDao(live.connection.db).clearMain(live.vharn.id);

    expectHidden(await read(live.bia, asset.id));
  });

  it('an image no map uses yet is read only by the master', async () => {
    const asset = await mapImageOf(live.ana, live.vharn);

    expect((await read(live.ana, asset.id)).statusCode).toBe(200);
    expectHidden(await read(live.bia, asset.id));
  });

  it('the outline answers under the same guard as the bytes', async () => {
    const asset = await mapImageOf(live.ana, live.vharn);
    await mapOver(asset);
    const outline = (user: SignedInUser): Promise<LightMyRequestResponse> =>
      live.http(user, { method: 'GET', url: `/api/assets/${asset.id}/outline` });

    expect((await outline(live.ana)).statusCode).toBe(200);
    expectHidden(await outline(live.bia));
  });

  it('a player or a spectator sending one gets 403 FORBIDDEN', async () => {
    for (const user of [live.bia, await spectator()]) {
      const response = await sendMapImage(user, live.vharn, await pngOf(20, 10));

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('a master or a player of another campaign gets ASSET_NOT_FOUND, even for a public main map', async () => {
    const asset = await mapImageOf(live.caio, live.quelm);
    await mapOver(asset, { visibility: 'public', isMain: true }, live.quelm);

    expectHidden(await read(live.ana, asset.id));
    expectHidden(await read(live.bia, asset.id));
  });

  it('cannot become the art of a token, the background of a grid or a cover', async () => {
    const asset = await mapImageOf(live.ana, live.vharn);
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
