import {
  assetResponseDto,
  campaignLibraryDto,
  documentWriteResponseDto,
  type DocumentDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { DocumentHttpHarness, firstTabOf } from '../support/document-http';
import { pngOf } from '../support/images';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();
const documents = new DocumentHttpHarness(live);
type Diary = Readonly<{ document: DocumentDto; geral: string; segredos: string }>;
// A public "Diário" owned by Bia: "Geral" and the masters-only "Segredos".
async function diary(): Promise<Diary> {
  const created = await documents.create({ name: 'Diário' });
  const shared = await documents.administer(created, {
    visibility: 'public',
    ownerIds: [live.bia.id],
  });
  const withSecret = await documents.createTab(shared, { name: 'Segredos' });
  const segredos = withSecret.receipt.tabId ?? '';
  const hidden = await live.http(live.ana, {
    method: 'PATCH',
    url: documents.tabUrl(created.id, segredos),
    payload: {
      actionId: crypto.randomUUID(),
      expectedVersion: withSecret.document.version,
      visibility: 'masters',
    },
  });
  expect(hidden.statusCode, hidden.body).toBe(200);
  const document = await documents.read(created.id);
  return { document, geral: firstTabOf(document).id, segredos };
}
async function preparedIn(documentId: string, tabId: string): Promise<string> {
  const response = await live.http(live.ana, {
    method: 'POST',
    url: `${documents.tabUrl(documentId, tabId)}/images`,
    headers: { 'content-type': 'image/png' },
    payload: await pngOf(80, 40),
  });
  expect(response.statusCode, response.body).toBe(201);
  return assetResponseDto.parse(response.json()).asset.id;
}
type PreviewChange = Readonly<{ summary: string | null; imageAssetId: string | null }>;
async function setPreview(
  user: SignedInUser,
  document: DocumentDto,
  change: PreviewChange,
  expectedVersion: number = document.version,
) {
  return live.http(user, {
    method: 'PATCH',
    url: `${documents.url(document.id)}/preview`,
    payload: { actionId: crypto.randomUUID(), expectedVersion, ...change },
  });
}
async function listedPreview(user: SignedInUser, documentId: string) {
  const response = await live.http(user, {
    method: 'GET',
    url: `/api/campaigns/${live.vharn.id}/library`,
  });
  expect(response.statusCode, response.body).toBe(200);
  const library = campaignLibraryDto.parse(response.json());
  return library.documents.find((document) => document.id === documentId)?.preview;
}
const statusOf = async (user: SignedInUser, assetId: string): Promise<number> =>
  (await live.http(user, { method: 'GET', url: `/api/assets/${assetId}` })).statusCode;

describe('document preview', () => {
  it('the owner sets summary and cover; Caio sees both in the library and reads the cover', async () => {
    const { document, geral } = await diary();
    const cover = await preparedIn(document.id, geral);
    expect(await statusOf(live.caio, cover)).toBe(404);

    const response = await setPreview(live.bia, document, {
      summary: '  Uma carta selada.  ',
      imageAssetId: cover,
    });

    expect(response.statusCode, response.body).toBe(200);
    const written = documentWriteResponseDto.parse(response.json());
    expect(written.document.version).toBe(document.version + 1);
    expect(written.receipt.operation).toBe('preview');
    expect(await listedPreview(live.caio, document.id)).toEqual({
      summary: 'Uma carta selada.',
      imageAssetId: cover,
    });
    expect(await statusOf(live.caio, cover)).toBe(200);
  });
  it('a cover prepared only in "Segredos" is refused to the owner and taken from the master', async () => {
    const { document, segredos } = await diary();
    const seal = await preparedIn(document.id, segredos);

    const refused = await setPreview(live.bia, document, { summary: null, imageAssetId: seal });
    expect(refused.statusCode).toBe(404);
    expect(refused.json()).toMatchObject({ code: 'DOCUMENT_ASSET_NOT_FOUND' });

    const taken = await setPreview(live.ana, document, { summary: null, imageAssetId: seal });
    expect(taken.statusCode, taken.body).toBe(200);
    expect(await statusOf(live.caio, seal)).toBe(200);
  });
  it('Caio, who reads but does not own it, is forbidden and nothing changes', async () => {
    const { document } = await diary();
    const response = await setPreview(live.caio, document, { summary: 'Meu', imageAssetId: null });
    expect(response.statusCode).toBe(403);
    expect(await listedPreview(live.ana, document.id)).toEqual({
      summary: null,
      imageAssetId: null,
    });
  });
  it('a stale version is a 409 and a summary over 280 characters a 400', async () => {
    const { document } = await diary();
    const stale = await setPreview(
      live.bia,
      document,
      { summary: 'Velha', imageAssetId: null },
      document.version - 1,
    );
    expect(stale.statusCode).toBe(409);
    const long = await setPreview(live.bia, document, {
      summary: 'a'.repeat(281),
      imageAssetId: null,
    });
    expect(long.statusCode).toBe(400);
  });
  it('hiding the document takes the cover bytes away from Caio', async () => {
    const { document, geral } = await diary();
    const cover = await preparedIn(document.id, geral);
    const set = await setPreview(live.ana, document, { summary: null, imageAssetId: cover });
    expect(set.statusCode, set.body).toBe(200);
    await documents.administer(documentWriteResponseDto.parse(set.json()).document, {
      visibility: 'private',
    });
    expect(await statusOf(live.caio, cover)).toBe(404);
    expect(await statusOf(live.bia, cover)).toBe(200);
  });
  it("an image of Quelm is no cover for Vharn's document, and Quelm's master cannot set it", async () => {
    const { document } = await diary();
    const quelmImage = await live.sendImage(live.caio, live.quelm);
    const foreign = await setPreview(live.ana, document, {
      summary: null,
      imageAssetId: quelmImage.id,
    });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toMatchObject({ code: 'DOCUMENT_ASSET_NOT_FOUND' });
    const outsider = await live.signUp('Duda');
    const stranger = await setPreview(outsider, document, { summary: 'Oi', imageAssetId: null });
    expect(stranger.statusCode).toBe(404);
  });
});
