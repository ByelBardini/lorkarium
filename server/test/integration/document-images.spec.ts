import { assetResponseDto, libraryImageDto, type DocumentDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { DocumentHttpHarness, documentText } from '../support/document-http';
import { pngOf, animatedGifOf } from '../support/images';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();
const documents = new DocumentHttpHarness(live);
async function upload(document: DocumentDto, user: SignedInUser = live.ana) {
  const response = await live.http(user, {
    method: 'POST',
    url: `${documents.url(document.id)}/images`,
    headers: { 'content-type': 'image/png' },
    payload: await pngOf(80, 40),
  });
  expect(response.statusCode, response.body).toBe(201);
  return assetResponseDto.parse(response.json()).asset;
}
const readAsset = (user: SignedInUser, assetId: string) =>
  live.http(user, { method: 'GET', url: `/api/assets/${assetId}` });

describe('document image authorization and references', () => {
  it('keeps prepared images private to editors until the public document confirms the reference', async () => {
    let document = await documents.administer(await documents.create(), {
      visibility: 'public',
      ownerIds: [live.bia.id],
    });
    const asset = await upload(document, live.bia);
    expect((await readAsset(live.bia, asset.id)).statusCode).toBe(200);
    expect((await readAsset(live.caio, asset.id)).statusCode).toBe(404);
    document = await documents.save(
      document,
      { type: 'doc', content: [{ type: 'image', attrs: { assetId: asset.id, alt: 'Carta' } }] },
      live.bia,
    );
    const readable = await readAsset(live.caio, asset.id);
    expect(readable.statusCode).toBe(200);
    expect(readable.headers['cache-control']).toBe('private, no-store');
    await documents.administer(document, { visibility: 'private' });
    expect((await readAsset(live.caio, asset.id)).statusCode).toBe(404);
  });
  it('revokes a removed image reference from public readers while preserving editor preview', async () => {
    let document = await documents.administer(await documents.create(), { visibility: 'public' });
    const asset = await upload(document);
    document = await documents.save(document, {
      type: 'doc',
      content: [{ type: 'image', attrs: { assetId: asset.id } }],
    });
    expect((await readAsset(live.bia, asset.id)).statusCode).toBe(200);
    await documents.save(document, documentText('Imagem retirada'));
    expect((await readAsset(live.bia, asset.id)).statusCode).toBe(404);
    expect((await readAsset(live.ana, asset.id)).statusCode).toBe(200);
  });
  it('refuses arbitrary unassociated assets and references from another document', async () => {
    const document = await documents.create();
    const other = await documents.create();
    const asset = await upload(other);
    const response = await live.http(live.ana, {
      method: 'PATCH',
      url: `${documents.url(document.id)}/content`,
      payload: {
        actionId: crypto.randomUUID(),
        expectedVersion: 0,
        content: { type: 'doc', content: [{ type: 'image', attrs: { assetId: asset.id } }] },
      },
    });
    expect(response.statusCode).toBe(404);
    expect((await documents.read(document.id)).version).toBe(0);
  });
  it('refuses public non-owner uploads and import before exposing private fetch diagnostics', async () => {
    const document = await documents.administer(await documents.create(), { visibility: 'public' });
    expect(
      (
        await live.http(live.bia, {
          method: 'POST',
          url: `${documents.url(document.id)}/images`,
          headers: { 'content-type': 'image/png' },
          payload: await pngOf(20, 10),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await live.http(live.bia, {
          method: 'POST',
          url: `${documents.url(document.id)}/images/import`,
          payload: { url: 'http://127.0.0.1/private.png' },
        })
      ).statusCode,
    ).toBe(403);
    const blocked = await live.http(live.ana, {
      method: 'POST',
      url: `${documents.url(document.id)}/images/import`,
      payload: { url: 'http://127.0.0.1/private.png' },
    });
    expect(blocked.statusCode).toBe(422);
    expect(blocked.json()).toMatchObject({ code: 'LINK_BLOCKED' });
  });
  it('refuses the reserved document purpose on generic upload and import endpoints', async () => {
    const generic = `/api/campaigns/${live.vharn.id}/assets`;
    expect(
      (
        await live.http(live.ana, {
          method: 'POST',
          url: `${generic}?purpose=document_image`,
          headers: { 'content-type': 'image/png' },
          payload: await pngOf(20, 10),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await live.http(live.ana, {
          method: 'POST',
          url: `${generic}/import`,
          payload: { url: 'http://127.0.0.1/private.png', purpose: 'document_image' },
        })
      ).statusCode,
    ).toBe(403);
  });
  it('refuses GIF and HTML disguised as a static image', async () => {
    const document = await documents.create();
    for (const bytes of [await animatedGifOf(2, 10), Buffer.from('<html>not an image</html>')]) {
      const response = await live.http(live.ana, {
        method: 'POST',
        url: `${documents.url(document.id)}/images`,
        headers: { 'content-type': 'image/png' },
        payload: bytes,
      });
      expect(response.statusCode).toBe(422);
    }
  });
  it('preserves linked library pixels after removing their original library item', async () => {
    const upload = await live.http(live.ana, {
      method: 'POST',
      url: `/api/campaigns/${live.vharn.id}/assets?purpose=library_image`,
      headers: { 'content-type': 'image/png' },
      payload: await pngOf(40, 30),
    });
    const asset = assetResponseDto.parse(upload.json()).asset;
    const created = await live.http(live.ana, {
      method: 'POST',
      url: `/api/campaigns/${live.vharn.id}/library-images`,
      payload: { name: 'Fonte privada', assetId: asset.id },
    });
    const image = libraryImageDto.parse(created.json());
    let document = await documents.administer(await documents.create(), { visibility: 'public' });
    const associated = await live.http(live.ana, {
      method: 'POST',
      url: `${documents.url(document.id)}/images/from-library`,
      payload: { imageId: image.id },
    });
    expect(associated.statusCode, associated.body).toBe(201);
    expect(assetResponseDto.parse(associated.json()).asset.id).toBe(asset.id);
    document = await documents.save(document, {
      type: 'doc',
      content: [{ type: 'image', attrs: { assetId: asset.id } }],
    });
    expect(
      (
        await live.http(live.ana, {
          method: 'DELETE',
          url: `/api/campaigns/${live.vharn.id}/library-images/${image.id}`,
        })
      ).statusCode,
    ).toBe(204);
    expect((await readAsset(live.bia, asset.id)).statusCode).toBe(200);
    expect((await documents.read(document.id)).content).toEqual({
      type: 'doc',
      content: [{ type: 'image', attrs: { assetId: asset.id } }],
    });
  });
  it('refuses selecting a private library image as a player owner', async () => {
    const upload = await live.http(live.ana, {
      method: 'POST',
      url: `/api/campaigns/${live.vharn.id}/assets?purpose=library_image`,
      headers: { 'content-type': 'image/png' },
      payload: await pngOf(40, 30),
    });
    const asset = assetResponseDto.parse(upload.json()).asset;
    const created = await live.http(live.ana, {
      method: 'POST',
      url: `/api/campaigns/${live.vharn.id}/library-images`,
      payload: { name: 'Não compartilhar', assetId: asset.id },
    });
    const image = libraryImageDto.parse(created.json());
    const document = await documents.administer(await documents.create(), {
      ownerIds: [live.bia.id],
    });
    expect(
      (
        await live.http(live.bia, {
          method: 'POST',
          url: `${documents.url(document.id)}/images/from-library`,
          payload: { imageId: image.id },
        })
      ).statusCode,
    ).toBe(404);
  });
});
