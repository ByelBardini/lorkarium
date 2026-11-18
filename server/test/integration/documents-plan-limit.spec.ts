import {
  DOCUMENT_TABS_MAX,
  EMPTY_DOCUMENT_CONTENT,
  documentResponseDto,
  documentWriteResponseDto,
  type DocumentDto,
  type DocumentTabSummaryDto,
  type UserPlan,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { DocumentTabsDao } from '../../src/modules/documents/document-tabs.dao';
import { setAccountPlan } from '../support/account-plans';
import { DocumentHttpHarness, documentText } from '../support/document-http';
import { secondTableOf } from '../support/plan-lock-tables';
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
  it('a document of a free table with 3 tabs refuses the 4th with 403 PLAN_LIMIT documentTabs', async () => {
    await anaOn('free');
    const document = await documentWithTabs(3);

    const response = await createTab(document);

    expect(response.statusCode, response.body).toBe(403);
    expect(response.json()).toMatchObject({
      code: 'PLAN_LIMIT',
      planLimit: { resource: 'documentTabs', limit: 3, plan: 'free' },
    });
    expect(await tabCount(document)).toBe(3);
    expect((await documents.read(document.id)).version).toBe(document.version);
  });

  it('a free table creates a new document with its "Geral" tab, and its 3rd tab', async () => {
    await anaOn('free');
    const document = await documentWithTabs(2);

    const response = await createTab(document);

    expect(document.tabs.map(({ name }) => name)).toEqual(['Geral']);
    expect(response.statusCode, response.body).toBe(201);
    expect(await tabCount(document)).toBe(3);
  });

  it('a narrador table creates the 4th tab', async () => {
    await anaOn('narrador');
    const document = await documentWithTabs(3);

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

// A document of `campaignId` with `total` tabs, each born through the HTTP edge in its own
// transaction (so the creation order is the position order), with Ana on `amigo_do_dono`.
async function documentBornAbovePlan(campaignId: string, total: number): Promise<DocumentDto> {
  await anaOn('amigo_do_dono');
  const url = `/api/campaigns/${campaignId}/documents`;
  const created = await live.http(live.ana, {
    method: 'POST',
    url,
    payload: { actionId: crypto.randomUUID() },
  });
  let document = documentWriteResponseDto.parse(created.json()).document;
  for (let index = 1; index < total; index += 1) {
    const payload = { actionId: crypto.randomUUID(), expectedVersion: document.version };
    const tab = await live.http(live.ana, {
      method: 'POST',
      url: `${url}/${document.id}/tabs`,
      payload,
    });
    expect(tab.statusCode, tab.body).toBe(201);
    document = documentWriteResponseDto.parse(tab.json()).document;
  }
  return document;
}

function tabAt(document: DocumentDto, index: number): DocumentTabSummaryDto {
  const tab = document.tabs[index];
  if (!tab)
    throw new Error(`Document ${document.id} has no tab ${index}; it has ${document.tabs.length}`);
  return tab;
}

function saveTabBody(campaignId: string, document: DocumentDto, index: number, text: string) {
  const tab = tabAt(document, index);
  return live.http(live.ana, {
    method: 'PATCH',
    url: `/api/campaigns/${campaignId}/documents/${document.id}/tabs/${tab.id}/content`,
    payload: {
      actionId: crypto.randomUUID(),
      expectedVersion: tab.version,
      content: documentText(text),
    },
  });
}

function changeTab(document: DocumentDto, index: number, changes: Record<string, unknown>) {
  return live.http(live.ana, {
    method: 'PATCH',
    url: documents.tabUrl(document.id, tabAt(document, index).id),
    payload: { actionId: crypto.randomUUID(), expectedVersion: document.version, ...changes },
  });
}

function deleteTab(document: DocumentDto, index: number) {
  return live.http(live.ana, {
    method: 'DELETE',
    url: documents.tabUrl(document.id, tabAt(document, index).id),
    payload: { actionId: crypto.randomUUID(), expectedVersion: document.version },
  });
}

function expectReadOnly(response: { statusCode: number; body: string; json: () => unknown }): void {
  expect(response.statusCode, response.body).toBe(403);
  expect(response.json()).toMatchObject({
    code: 'PLAN_LIMIT',
    planLimit: { resource: 'documentTabs', reason: 'readOnly', limit: 3, plan: 'free' },
  });
}

describe('document tabs past the plan of a table that went down are read only', () => {
  it('on a free table, the 3rd of 5 tabs saves its body with 200 and the 4th is 403 PLAN_LIMIT readOnly', async () => {
    const document = await documentBornAbovePlan(live.vharn.id, 5);
    await anaOn('free');

    const third = await saveTabBody(live.vharn.id, document, 2, 'Terceira');
    const fourth = await saveTabBody(live.vharn.id, document, 3, 'Quarta');

    expect(third.statusCode, third.body).toBe(200);
    expectReadOnly(fourth);
    const kept = await documents.readTab(document.id, tabAt(document, 3).id);
    expect(kept.content).toEqual(EMPTY_DOCUMENT_CONTENT);
  });

  it('renaming the 4th tab is 403 readOnly, while hiding it, reordering and renaming the 3rd pass', async () => {
    const born = await documentBornAbovePlan(live.vharn.id, 5);
    await anaOn('free');

    const renamed = await changeTab(born, 3, { name: 'Quarta' });
    const third = await changeTab(born, 2, { name: 'Terceira' });
    const afterThird = await documents.read(born.id);
    const hidden = await changeTab(afterThird, 3, { visibility: 'masters' });
    const afterHidden = await documents.read(born.id);
    const order = afterHidden.tabs.map(({ id }) => id).reverse();
    const reordered = await live.http(live.ana, {
      method: 'PATCH',
      url: `${documents.tabUrl(born.id)}/order`,
      payload: {
        actionId: crypto.randomUUID(),
        expectedVersion: afterHidden.version,
        tabIds: order,
      },
    });

    expectReadOnly(renamed);
    expect([third.statusCode, hidden.statusCode, reordered.statusCode]).toEqual([200, 200, 200]);
  });

  it('the document and the opened tab carry planLocked only from the 4th tab on', async () => {
    const born = await documentBornAbovePlan(live.vharn.id, 5);
    await anaOn('free');

    const document = await documents.read(born.id);
    const fourth = await documents.readTab(born.id, tabAt(born, 3).id);
    const third = await documents.readTab(born.id, tabAt(born, 2).id);

    expect(document.tabs.map(({ planLocked }) => planLocked)).toEqual([
      false,
      false,
      false,
      true,
      true,
    ]);
    expect([third.planLocked, fourth.planLocked]).toEqual([false, true]);
  });

  it('deleting the 2nd tab passes, and then the old 4th saves with 200 and only the last stays locked', async () => {
    const born = await documentBornAbovePlan(live.vharn.id, 5);
    await anaOn('free');

    const deleted = await deleteTab(born, 1);
    const document = await documents.read(born.id);
    const oldFourth = await saveTabBody(live.vharn.id, document, 2, 'Agora editável');

    expect(deleted.statusCode, deleted.body).toBe(200);
    expect(oldFourth.statusCode, oldFourth.body).toBe(200);
    expect(document.tabs.map(({ planLocked }) => planLocked)).toEqual([false, false, false, true]);
  });

  it('the rank is per document: a newer document of the same free table edits its 3rd tab', async () => {
    await documentBornAbovePlan(live.vharn.id, 5);
    const newer = await documentBornAbovePlan(live.vharn.id, 3);
    await anaOn('free');

    const third = await saveTabBody(live.vharn.id, newer, 2, 'Terceira do novo');

    expect(third.statusCode, third.body).toBe(200);
    expect((await documents.read(newer.id)).tabs.every(({ planLocked }) => !planLocked)).toBe(true);
  });

  it('the tabs of Ana’s Vharn do not count at her other table Ermo, both on free', async () => {
    await documentBornAbovePlan(live.vharn.id, 5);
    await anaOn('amigo_do_dono');
    const ermo = await secondTableOf(live, live.ana, 'Ermo');
    const atErmo = await documentBornAbovePlan(ermo.id, 3);
    await anaOn('free');

    const third = await saveTabBody(ermo.id, atErmo, 2, 'Terceira de Ermo');
    const read = await live.http(live.ana, {
      method: 'GET',
      url: `/api/campaigns/${ermo.id}/documents/${atErmo.id}`,
    });

    expect(third.statusCode, third.body).toBe(200);
    const tabs = documentResponseDto.parse(read.json()).document.tabs;
    expect(tabs.map(({ planLocked }) => planLocked)).toEqual([false, false, false]);
  });
});
