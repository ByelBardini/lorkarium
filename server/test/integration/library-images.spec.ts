import {
  assetResponseDto,
  libraryImageDto,
  campaignLibraryDto,
  libraryDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { pngOf, animatedGifOf } from '../support/images';
import { send, envelope, synced } from '../support/live-table';
import { tokenCommandFor, useTokenTable } from '../support/token-table';
import type { SignedInUser } from '../support/sign-in';
import { SceneFoldersDao } from '../../src/modules/library/scene-folders.dao';
const live = useTokenTable();
const url = () => `/api/campaigns/${live.vharn.id}/library-images`;
async function upload(user: SignedInUser = live.ana, purpose = 'library_image') {
  const response = await live.http(user, {
    method: 'POST',
    url: `/api/campaigns/${live.vharn.id}/assets?purpose=${purpose}`,
    headers: { 'content-type': 'image/png' },
    payload: await pngOf(80, 40),
  });
  expect(response.statusCode, response.body).toBe(201);
  return assetResponseDto.parse(response.json()).asset;
}
async function create(overrides: object = {}) {
  const asset = await upload();
  const response = await live.http(live.ana, {
    method: 'POST',
    url: url(),
    payload: { name: '  Retrato  ', assetId: asset.id, ...overrides },
  });
  expect(response.statusCode, response.body).toBe(201);
  return libraryImageDto.parse(response.json());
}
const read = (user: SignedInUser, id: string) =>
  live.http(user, { method: 'GET', url: `/api/assets/${id}` });
describe('library image HTTP and access isolation', () => {
  it('creates private by default; dedicated orphan and private bytes are only readable by the master, without caching', async () => {
    const asset = await upload();
    expect((await read(live.ana, asset.id)).headers['cache-control']).toBe('private, no-store');
    expect((await read(live.bia, asset.id)).statusCode).toBe(404);
    const image = await create();
    expect(image).toMatchObject({ name: 'Retrato', folderId: null, visibility: 'private' });
    expect((await read(live.bia, image.asset.id)).statusCode).toBe(404);
  });
  it('public images expose their folders and bytes; privating removes both while old scenes shape stays exact', async () => {
    const folder = await new SceneFoldersDao(live.connection.db).insert({
      campaignId: live.vharn.id,
      name: 'Galeria',
    });
    const image = await create({ folderId: folder.id, visibility: 'public' });
    const response = await live.http(live.bia, {
      method: 'GET',
      url: `/api/campaigns/${live.vharn.id}/library`,
    });
    const mixed = campaignLibraryDto.parse(response.json());
    expect(mixed.images.map((x) => x.id)).toEqual([image.id]);
    expect(mixed.folders.map((x) => x.id)).toContain(folder.id);
    expect((await read(live.bia, image.asset.id)).statusCode).toBe(200);
    await live.http(live.ana, {
      method: 'PATCH',
      url: `${url()}/${image.id}`,
      payload: { visibility: 'private' },
    });
    expect((await read(live.bia, image.asset.id)).statusCode).toBe(404);
    const hidden = campaignLibraryDto.parse(
      (
        await live.http(live.bia, { method: 'GET', url: `/api/campaigns/${live.vharn.id}/library` })
      ).json(),
    );
    expect(hidden.images).toEqual([]);
    expect(hidden.folders).toEqual([]);
    const legacy = await live.http(live.bia, {
      method: 'GET',
      url: `/api/campaigns/${live.vharn.id}/scenes`,
    });
    expect(libraryDto.safeParse(legacy.json()).success).toBe(true);
  });
  it('refuses mutations and uploads by players/spectators and reserved assets from ordinary purposes', async () => {
    const image = await create();
    expect(
      (await live.http(live.bia, { method: 'DELETE', url: `${url()}/${image.id}` })).statusCode,
    ).toBe(403);
    const orphan = await upload(live.ana, 'token');
    expect(
      (
        await live.http(live.ana, {
          method: 'POST',
          url: url(),
          payload: { name: 'Forbidden', assetId: orphan.id },
        })
      ).statusCode,
    ).toBe(404);
    const duda = await live.signUp('Duda');
    await live.joinAsSpectator(duda, live.vharn);
    for (const user of [live.bia, duda]) {
      const response = await live.http(user, {
        method: 'POST',
        url: `/api/campaigns/${live.vharn.id}/assets?purpose=library_image`,
        headers: { 'content-type': 'image/png' },
        payload: await pngOf(20, 10),
      });
      expect(response.statusCode).toBe(403);
    }
  });
  it('refuses another campaign asset/folder/image without changing anything', async () => {
    const otherAsset = await live.http(live.caio, {
      method: 'POST',
      url: `/api/campaigns/${live.quelm.id}/assets?purpose=library_image`,
      headers: { 'content-type': 'image/png' },
      payload: await pngOf(20, 10),
    });
    const asset = assetResponseDto.parse(otherAsset.json()).asset;
    expect(
      (
        await live.http(live.ana, {
          method: 'POST',
          url: url(),
          payload: { name: 'Leak', assetId: asset.id },
        })
      ).statusCode,
    ).toBe(404);
    expect((await read(live.ana, asset.id)).statusCode).toBe(404);
    const folder = await new SceneFoldersDao(live.connection.db).insert({
      campaignId: live.quelm.id,
      name: 'Other',
    });
    const valid = await upload();
    expect(
      (
        await live.http(live.ana, {
          method: 'POST',
          url: url(),
          payload: { name: 'Leak', assetId: valid.id, folderId: folder.id },
        })
      ).statusCode,
    ).toBe(404);
  });
  it('preserves images when deleting a nested folder', async () => {
    const dao = new SceneFoldersDao(live.connection.db);
    const parent = await dao.insert({ campaignId: live.vharn.id, name: 'Pai' });
    const child = await dao.insert({
      campaignId: live.vharn.id,
      parentId: parent.id,
      name: 'Filha',
    });
    const image = await create({ folderId: child.id });
    expect(
      (
        await live.http(live.ana, {
          method: 'DELETE',
          url: `/api/campaigns/${live.vharn.id}/scene-folders/${child.id}`,
        })
      ).statusCode,
    ).toBe(204);
    const mixed = campaignLibraryDto.parse(
      (
        await live.http(live.ana, { method: 'GET', url: `/api/campaigns/${live.vharn.id}/library` })
      ).json(),
    );
    expect(mixed.images.find((x) => x.id === image.id)?.folderId).toBe(parent.id);
  });
  it('normalizes to 4096 preserving aspect ratio and refuses GIF', async () => {
    const response = await live.http(live.ana, {
      method: 'POST',
      url: `/api/campaigns/${live.vharn.id}/assets?purpose=library_image`,
      headers: { 'content-type': 'image/png' },
      payload: await pngOf(5000, 2500),
    });
    expect(assetResponseDto.parse(response.json()).asset).toMatchObject({
      width: 4096,
      height: 2048,
    });
    const gif = await live.http(live.ana, {
      method: 'POST',
      url: `/api/campaigns/${live.vharn.id}/assets?purpose=library_image`,
      headers: { 'content-type': 'image/gif' },
      payload: await animatedGifOf(2, 20),
    });
    expect(gif.statusCode).toBe(422);
  });
  it('reserved images cannot become token, aura, condition, form, background or cover references', async () => {
    const image = await create();
    const master = await live.atTable(live.ana, live.vharn);
    const token = tokenCommandFor(live.vharn, live.ana.id, { imageAssetId: image.asset.id });
    const aura = tokenCommandFor(live.vharn, live.ana.id, {
      aura: { kind: 'image', radius: 1, opacity: 100, imageAssetId: image.asset.id },
    });
    const form = tokenCommandFor(live.vharn, live.ana.id, {
      forms: [
        {
          id: crypto.randomUUID(),
          name: 'Forma',
          imageAssetId: image.asset.id,
          width: 1,
          height: 1,
          frame: 'round',
        },
      ],
    });
    for (const payload of [token, aura])
      expect(await send(master, 'token:create', payload)).toMatchObject({
        ok: false,
        error: { code: 'ASSET_NOT_FOUND' },
      });
    await send(master, 'token:create', tokenCommandFor(live.vharn, live.ana.id));
    const tokenId = (await synced(master, live.vharn)).tokens[0]?.id;
    const formUpdate = { ...form, tokenId } as Record<string, unknown>;
    delete formUpdate.col;
    delete formUpdate.row;
    expect(await send(master, 'token:update', formUpdate)).toMatchObject({
      ok: false,
      error: { code: 'ASSET_NOT_FOUND' },
    });
    expect(
      await send(master, 'condition:define', {
        ...envelope(live.vharn.id),
        name: 'Retrato',
        tone: 'harm',
        icon: 'eye-off',
        imageAssetId: image.asset.id,
      }),
    ).toMatchObject({ ok: false, error: { code: 'ASSET_NOT_FOUND' } });
    expect(
      await send(master, 'scene:configure', {
        ...envelope(live.vharn.id),
        widthCells: 30,
        heightCells: 20,
        cellDistance: 1.5,
        cellUnit: 'm',
        gridVisible: true,
        gridOpacity: 15,
        backgroundAssetId: image.asset.id,
      }),
    ).toMatchObject({ ok: false, error: { code: 'ASSET_NOT_FOUND' } });
    const cover = await live.http(live.ana, {
      method: 'PATCH',
      url: `/api/campaigns/${live.vharn.id}`,
      payload: { cover: { kind: 'image', assetId: image.asset.id } },
    });
    expect(cover.statusCode).toBe(400);
    const state = await synced(master, live.vharn);
    expect(state.tokens).toHaveLength(1);
    expect(state.tokens[0]?.imageAssetId).toBeNull();
    expect(state.scene.background).toBeNull();
  });
  it('does not allow a second record to own the same file', async () => {
    const image = await create();
    const duplicate = await live.http(live.ana, {
      method: 'POST',
      url: url(),
      payload: { name: 'Outro', assetId: image.asset.id },
    });
    expect(duplicate.statusCode).toBe(404);
    const mixed = campaignLibraryDto.parse(
      (
        await live.http(live.ana, { method: 'GET', url: `/api/campaigns/${live.vharn.id}/library` })
      ).json(),
    );
    expect(mixed.images).toHaveLength(1);
  });
  it('malformed campaign and image ids stay indistinguishable from missing records', async () => {
    for (const suffix of ['library', 'image-presentation', 'library-images']) {
      const response = await live.http(live.ana, {
        method: suffix === 'library-images' ? 'POST' : 'GET',
        url: `/api/campaigns/not-a-uuid/${suffix}`,
        payload:
          suffix === 'library-images'
            ? { name: 'Retrato', assetId: crypto.randomUUID() }
            : undefined,
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
    }
    const image = await live.http(live.ana, { method: 'DELETE', url: `${url()}/not-a-uuid` });
    expect(image.statusCode).toBe(404);
    expect(image.json()).toMatchObject({ code: 'LIBRARY_IMAGE_NOT_FOUND' });
  });
});
