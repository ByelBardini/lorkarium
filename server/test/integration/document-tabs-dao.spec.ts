import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { DocumentsDao } from '../../src/modules/documents/documents.dao';
import { DocumentTabsDao } from '../../src/modules/documents/document-tabs.dao';
import { libraryDocuments } from '../../src/modules/documents/documents.po';
import { libraryDocumentTabs } from '../../src/modules/documents/document-tabs.po';
import { documentText } from '../support/document-http';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();
async function documentOf(campaignId: string, name = 'Diário'): Promise<string> {
  const row = await new DocumentsDao(live.connection.db).insert({ campaignId, name });
  return row.id;
}
async function tabOf(
  campaignId: string,
  documentId: string,
  name: string,
  position: number,
): Promise<string> {
  const row = await new DocumentTabsDao(live.connection.db).insert({
    campaignId,
    documentId,
    name,
    position,
    content: documentText(name),
  });
  return row.id;
}
describe('document tabs persistence', () => {
  it('lists the tabs of a document in position order without their content', async () => {
    const documentId = await documentOf(live.vharn.id);
    await tabOf(live.vharn.id, documentId, 'Itens', 1);
    await tabOf(live.vharn.id, documentId, 'Geral', 0);
    const tabs = await new DocumentTabsDao(live.connection.db).listOfDocument(
      live.vharn.id,
      documentId,
    );
    expect(tabs.map((tab) => [tab.name, tab.position])).toEqual([
      ['Geral', 0],
      ['Itens', 1],
    ]);
    expect(tabs[0]).not.toHaveProperty('content');
  });
  it('finds one tab with its content and counts the tabs of the document', async () => {
    const documentId = await documentOf(live.vharn.id);
    const tabId = await tabOf(live.vharn.id, documentId, 'Itens', 0);
    const dao = new DocumentTabsDao(live.connection.db);
    expect(await dao.findInDocument(live.vharn.id, documentId, tabId)).toMatchObject({
      name: 'Itens',
      visibility: 'document',
      version: 0,
      content: documentText('Itens'),
    });
    expect(await dao.countOfDocument(live.vharn.id, documentId)).toBe(1);
  });
  it('saving content bumps the tab version and leaves the document version alone', async () => {
    const documentId = await documentOf(live.vharn.id);
    const tabId = await tabOf(live.vharn.id, documentId, 'Itens', 0);
    const dao = new DocumentTabsDao(live.connection.db);
    const saved = await dao.saveContent(live.vharn.id, documentId, tabId, {
      content: documentText('Corda de 15 m'),
      updatedAt: new Date('2026-10-31T12:00:00Z'),
    });
    expect(saved.version).toBe(1);
    const [document] = await live.connection.db
      .select({ version: libraryDocuments.version })
      .from(libraryDocuments)
      .where(eq(libraryDocuments.id, documentId));
    expect(document?.version).toBe(0);
    expect((await dao.findInDocument(live.vharn.id, documentId, tabId))?.content).toEqual(
      documentText('Corda de 15 m'),
    );
  });
  it('reorder swapping the first and third tab does not trip the position unique', async () => {
    const documentId = await documentOf(live.vharn.id);
    const a = await tabOf(live.vharn.id, documentId, 'A', 0);
    const b = await tabOf(live.vharn.id, documentId, 'B', 1);
    const c = await tabOf(live.vharn.id, documentId, 'C', 2);
    const dao = new DocumentTabsDao(live.connection.db);
    await dao.reorder(live.vharn.id, documentId, [
      { id: c, position: 0 },
      { id: b, position: 1 },
      { id: a, position: 2 },
    ]);
    expect((await dao.listOfDocument(live.vharn.id, documentId)).map((tab) => tab.name)).toEqual([
      'C',
      'B',
      'A',
    ]);
  });
  it.each([
    ['an empty', ''],
    ['a 41-character', 'x'.repeat(41)],
  ])('the CHECK refuses %s tab name', async (_label, name) => {
    const documentId = await documentOf(live.vharn.id);
    await expect(tabOf(live.vharn.id, documentId, name, 0)).rejects.toMatchObject({
      cause: { code: '23514' },
    });
  });
  it('a Quelm tab is not found through the Vharn campaign id', async () => {
    const documentId = await documentOf(live.quelm.id);
    const tabId = await tabOf(live.quelm.id, documentId, 'Segredos', 0);
    const dao = new DocumentTabsDao(live.connection.db);
    expect(await dao.findInDocument(live.vharn.id, documentId, tabId)).toBeUndefined();
    expect(await dao.listOfDocument(live.vharn.id, documentId)).toEqual([]);
  });
  it('the composite FK refuses a tab pointing at a document of another campaign', async () => {
    const documentId = await documentOf(live.quelm.id);
    await expect(tabOf(live.vharn.id, documentId, 'Intrusa', 0)).rejects.toMatchObject({
      cause: { code: '23503' },
    });
  });
  it('deleting the document takes its tabs in the cascade', async () => {
    const documentId = await documentOf(live.vharn.id);
    await tabOf(live.vharn.id, documentId, 'Geral', 0);
    await new DocumentsDao(live.connection.db).delete(live.vharn.id, documentId);
    expect(
      await live.connection.db
        .select()
        .from(libraryDocumentTabs)
        .where(eq(libraryDocumentTabs.documentId, documentId)),
    ).toEqual([]);
  });
  it('ranks the tabs by birth (created_at, then id), not by position, in rankOf and in the list', async () => {
    const documentId = await documentOf(live.vharn.id);
    const otherId = await documentOf(live.vharn.id, 'Bestiário');
    const dao = new DocumentTabsDao(live.connection.db);
    const born = new Date('2026-11-01T10:00:00.000Z');
    const later = new Date('2026-11-01T10:00:01.000Z');
    const insert = (id: string, docId: string, position: number, createdAt: Date) =>
      dao.insert({
        campaignId: live.vharn.id,
        documentId: docId,
        id,
        name: `Aba ${position}`,
        position,
        content: documentText(''),
        createdAt,
      });
    const LATE = '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c';
    const SECOND = '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b';
    const FIRST = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
    const OTHER = '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d';
    await insert(OTHER, otherId, 0, new Date('2026-10-01T10:00:00.000Z'));
    await insert(LATE, documentId, 0, later);
    await insert(SECOND, documentId, 1, born);
    await insert(FIRST, documentId, 2, born);

    const ranks = [LATE, SECOND, FIRST].map((id) => dao.rankOf(live.vharn.id, documentId, id));
    const listed = await dao.listOfDocument(live.vharn.id, documentId);

    expect(await Promise.all(ranks)).toEqual([2, 1, 0]);
    expect(listed.map(({ id, rank }) => [id, rank])).toEqual([
      [LATE, 2],
      [SECOND, 1],
      [FIRST, 0],
    ]);
    expect(await dao.rankOf(live.vharn.id, documentId, OTHER)).toBeUndefined();
    expect(await dao.rankOf(live.quelm.id, documentId, FIRST)).toBeUndefined();
  });
});
