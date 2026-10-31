import {
  campaignLibraryDto,
  documentResponseDto,
  EMPTY_DOCUMENT_CONTENT,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { SceneFoldersDao } from '../../src/modules/library/scene-folders.dao';
import { DocumentHttpHarness, documentText } from '../support/document-http';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();
const documents = new DocumentHttpHarness(live);
describe('document creation and authorized reads', () => {
  it('creates a private unnamed document at version zero with no owners and an empty paragraph', async () => {
    expect(await documents.create()).toMatchObject({
      name: 'Documento sem nome',
      visibility: 'private',
      version: 0,
      ownerIds: [],
      schemaVersion: 1,
      content: EMPTY_DOCUMENT_CONTENT,
      canEdit: true,
      canManage: true,
    });
  });
  it('keeps the confirmed content after restarting the application', async () => {
    const document = await documents.create();
    await documents.save(document, documentText('Carta persistida'));
    await live.restart();
    expect(await documents.read(document.id)).toMatchObject({
      version: 1,
      content: documentText('Carta persistida'),
    });
  });
  it('refuses player creation and anonymous reads without revealing a body', async () => {
    const document = await documents.create();
    expect(
      (
        await live.http(live.bia, {
          method: 'POST',
          url: documents.url(),
          payload: { actionId: crypto.randomUUID() },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await live.http(null, { method: 'GET', url: documents.url(document.id) })).statusCode,
    ).toBe(401);
    const hidden = await live.http(live.bia, { method: 'GET', url: documents.url(document.id) });
    expect(hidden.statusCode).toBe(404);
    expect(hidden.json()).toMatchObject({ code: 'DOCUMENT_NOT_FOUND' });
    expect(hidden.body).not.toContain('Documento sem nome');
  });
  it('refuses a document ID addressed through another campaign and malformed IDs', async () => {
    const document = await documents.create();
    const response = await live.http(live.caio, {
      method: 'GET',
      url: `/api/campaigns/${live.quelm.id}/documents/${document.id}`,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'DOCUMENT_NOT_FOUND' });
    expect(
      (await live.http(live.ana, { method: 'GET', url: documents.url('invalid') })).statusCode,
    ).toBe(404);
  });
  it('returns no-store headers and only summaries in the mixed library', async () => {
    const document = await documents.create();
    await documents.save(document, documentText('Corpo secreto'));
    const response = await live.http(live.ana, { method: 'GET', url: documents.url(document.id) });
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(documentResponseDto.parse(response.json()).document.content).toEqual(
      documentText('Corpo secreto'),
    );
    const aggregate = await live.http(live.ana, {
      method: 'GET',
      url: `/api/campaigns/${live.vharn.id}/library`,
    });
    expect(aggregate.headers['cache-control']).toBe('private, no-store');
    expect(campaignLibraryDto.parse(aggregate.json()).documents).toEqual([
      expect.objectContaining({ id: document.id, version: 1 }),
    ]);
    expect(aggregate.body).not.toContain('Corpo secreto');
  });
  it('exposes ancestors of an owned private document but hides another private document', async () => {
    const folder = await new SceneFoldersDao(live.connection.db).insert({
      campaignId: live.vharn.id,
      name: 'Segredos',
    });
    const document = await documents.create({ folderId: folder.id });
    await documents.create({ name: 'Nunca revelar' });
    await documents.administer(document, { ownerIds: [live.bia.id] });
    const response = await live.http(live.bia, {
      method: 'GET',
      url: `/api/campaigns/${live.vharn.id}/library`,
    });
    const library = campaignLibraryDto.parse(response.json());
    expect(library.documents.map((entry) => entry.id)).toEqual([document.id]);
    expect(library.folders.map((entry) => entry.id)).toContain(folder.id);
    expect(response.body).not.toContain('Nunca revelar');
    expect(library.documents[0]).not.toHaveProperty('ownerIds');
  });
  it('moves documents to the parent on folder removal without changing content or owners', async () => {
    const folders = new SceneFoldersDao(live.connection.db);
    const parent = await folders.insert({ campaignId: live.vharn.id, name: 'Pai' });
    const child = await folders.insert({
      campaignId: live.vharn.id,
      name: 'Filha',
      parentId: parent.id,
    });
    const created = await documents.create({ folderId: child.id });
    const owned = await documents.administer(created, { ownerIds: [live.bia.id] });
    await documents.save(owned, documentText('Preservar'));
    expect(
      (
        await live.http(live.ana, {
          method: 'DELETE',
          url: `/api/campaigns/${live.vharn.id}/scene-folders/${child.id}`,
        })
      ).statusCode,
    ).toBe(204);
    expect(await documents.read(created.id)).toMatchObject({
      folderId: parent.id,
      ownerIds: [live.bia.id],
      content: documentText('Preservar'),
    });
  });
});
