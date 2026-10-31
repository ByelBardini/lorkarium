import { assetResponseDto, type DocumentContentDto, type DocumentDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { DocumentHttpHarness, documentText } from '../support/document-http';
import { pngOf } from '../support/images';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();
const documents = new DocumentHttpHarness(live);
type Bestiary = Readonly<{ document: DocumentDto; itens: string; segredos: string }>;
// A public "Bestiário" without owners: "Geral", "Itens" and the masters-only "Segredos".
async function bestiary(): Promise<Bestiary> {
  const created = await documents.administer(await documents.create({ name: 'Bestiário' }), {
    visibility: 'public',
  });
  const withItens = await documents.createTab(created, { name: 'Itens' });
  const withSecret = await documents.createTab(withItens.document, { name: 'Segredos' });
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
  return { document: created, itens: withItens.receipt.tabId ?? '', segredos };
}
async function uploadTo(documentId: string, tabId: string, user: SignedInUser = live.ana) {
  return live.http(user, {
    method: 'POST',
    url: `${documents.tabUrl(documentId, tabId)}/images`,
    headers: { 'content-type': 'image/png' },
    payload: await pngOf(80, 40),
  });
}
async function preparedIn(documentId: string, tabId: string): Promise<string> {
  const response = await uploadTo(documentId, tabId);
  expect(response.statusCode, response.body).toBe(201);
  return assetResponseDto.parse(response.json()).asset.id;
}
function showing(assetId: string): DocumentContentDto {
  return { type: 'doc', content: [{ type: 'image', attrs: { assetId } }] };
}
async function saveBody(documentId: string, tabId: string, content: DocumentContentDto) {
  const tab = await documents.readTab(documentId, tabId);
  await documents.saveTab(documentId, tab, content);
}
const statusOf = async (user: SignedInUser, assetId: string): Promise<number> =>
  (await live.http(user, { method: 'GET', url: `/api/assets/${assetId}` })).statusCode;

describe('document images by tab', () => {
  it('an image saved into "Itens" is served to Bia', async () => {
    const { document, itens } = await bestiary();
    const asset = await preparedIn(document.id, itens);
    await saveBody(document.id, itens, showing(asset));
    expect(await statusOf(live.bia, asset)).toBe(200);
  });
  it('an image in "Itens" and in "Segredos" stays served; out of "Itens" Bia loses it and Ana keeps it', async () => {
    const { document, itens, segredos } = await bestiary();
    const asset = await preparedIn(document.id, itens);
    await saveBody(document.id, itens, showing(asset));
    await saveBody(document.id, segredos, showing(asset));
    expect(await statusOf(live.bia, asset)).toBe(200);
    await saveBody(document.id, itens, documentText('Sem imagem'));
    expect(await statusOf(live.bia, asset)).toBe(404);
    expect(await statusOf(live.ana, asset)).toBe(200);
  });
  it('an image only in "Segredos" is a 404 to Bia, Caio and a spectator', async () => {
    const { document, segredos } = await bestiary();
    const asset = await preparedIn(document.id, segredos);
    await saveBody(document.id, segredos, showing(asset));
    const duda = await live.signUp('Duda');
    await live.joinAsSpectator(duda, live.vharn);
    expect(
      await Promise.all([live.bia, live.caio, duda].map((user) => statusOf(user, asset))),
    ).toEqual([404, 404, 404]);
    expect(await statusOf(live.ana, asset)).toBe(200);
  });
  it('a prepared image never saved is served to the editor only', async () => {
    const { document, itens } = await bestiary();
    const asset = await preparedIn(document.id, itens);
    expect(await statusOf(live.caio, asset)).toBe(404);
    expect(await statusOf(live.ana, asset)).toBe(200);
  });
  it('someone only at Quelm gets a 404 for a Vharn document image', async () => {
    const { document, itens } = await bestiary();
    const asset = await preparedIn(document.id, itens);
    await saveBody(document.id, itens, showing(asset));
    const duda = await live.signUp('Duda');
    await live.joinAsSpectator(duda, live.quelm);
    expect(await statusOf(duda, asset)).toBe(404);
  });
  it('an owner uploading into the hidden tab is refused as not found before any upload', async () => {
    const { document, segredos } = await bestiary();
    await documents.administer(await documents.read(document.id), { ownerIds: [live.bia.id] });
    const refused = await uploadTo(document.id, segredos, live.bia);
    expect(refused.statusCode).toBe(404);
    expect(refused.json()).toMatchObject({ code: 'DOCUMENT_TAB_NOT_FOUND' });
  });
});
