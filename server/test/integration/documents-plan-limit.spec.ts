import { DOCUMENT_TABS_MAX, type DocumentDto, type UserPlan } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { DocumentTabsDao } from '../../src/modules/documents/document-tabs.dao';
import { setAccountPlan } from '../support/account-plans';
import { DocumentHttpHarness, documentText } from '../support/document-http';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();
const documents = new DocumentHttpHarness(live);

function anaOn(plan: UserPlan): Promise<void> {
  return setAccountPlan(live.connection.db, live.ana.id, plan);
}

// A new document of Vharn ("Geral" at position 0) topped up to `total` tabs.
async function documentWithTabs(total: number): Promise<DocumentDto> {
  const document = await documents.create();
  const dao = new DocumentTabsDao(live.connection.db);
  for (let position = 1; position < total; position += 1)
    await dao.insert({
      campaignId: live.vharn.id,
      documentId: document.id,
      name: `Aba ${position}`,
      position,
      content: documentText(''),
    });
  return document;
}

function createTab(document: DocumentDto) {
  const payload = { actionId: crypto.randomUUID(), expectedVersion: document.version };
  return live.http(live.ana, { method: 'POST', url: documents.tabUrl(document.id), payload });
}

async function tabCount(document: DocumentDto): Promise<number> {
  const tabs = await new DocumentTabsDao(live.connection.db).listOfDocument(
    live.vharn.id,
    document.id,
  );
  return tabs.length;
}

describe("document tabs follow the owner's plan", () => {
  it('a document of a free table with 5 tabs refuses the 6th with 403 PLAN_LIMIT documentTabs', async () => {
    await anaOn('free');
    const document = await documentWithTabs(5);

    const response = await createTab(document);

    expect(response.statusCode, response.body).toBe(403);
    expect(response.json()).toMatchObject({
      code: 'PLAN_LIMIT',
      planLimit: { resource: 'documentTabs', limit: 5, plan: 'free' },
    });
    expect(await tabCount(document)).toBe(5);
    expect((await documents.read(document.id)).version).toBe(document.version);
  });

  it('a free table creates a new document with its "Geral" tab, and its 5th tab', async () => {
    await anaOn('free');
    const document = await documentWithTabs(4);

    const response = await createTab(document);

    expect(document.tabs.map(({ name }) => name)).toEqual(['Geral']);
    expect(response.statusCode, response.body).toBe(201);
    expect(await tabCount(document)).toBe(5);
  });

  it('a narrador table creates the 6th tab', async () => {
    await anaOn('narrador');
    const document = await documentWithTabs(5);

    expect((await createTab(document)).statusCode).toBe(201);
  });

  it(`an amigo_do_dono table past ${DOCUMENT_TABS_MAX} tabs still gets 422 DOCUMENT_TAB_LIMIT`, async () => {
    await anaOn('amigo_do_dono');
    const document = await documentWithTabs(DOCUMENT_TABS_MAX);

    const response = await createTab(document);

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'DOCUMENT_TAB_LIMIT' });
  });
});
