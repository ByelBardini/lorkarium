import type { DocumentSummaryDto, SceneFolderDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { VHARN } from '../support/campaigns-api-fake';
import {
  DOCUMENT_ID,
  documentFixture,
  documentTabFixture,
  ITEMS_TAB_ID,
  SECRETS_TAB_ID,
  summaryOfDocument,
  threeTabs,
} from '../support/documents-fixtures';
import { ATO_1, CATACUMBAS, vharnLibrary } from '../support/library-fixtures';
import { sheetBridgeHarness, type SheetBridgeHarness } from '../support/sheet-bridge-harness';

const DOCUMENTS = ['documents:read'] as const;
const CARTA_ID = '20000000-0000-4000-8000-000000000001';
const TRAMA_ID = '20000000-0000-4000-8000-000000000002';
const SUMIDO_ID = '20000000-0000-4000-8000-000000000003';
const SEGREDOS: SceneFolderDto = {
  id: '20000000-0000-4000-8000-0000000000f1',
  name: 'Segredos',
  parentId: null,
  visibility: 'private',
};

function summaryOf(changes: Partial<DocumentSummaryDto>): DocumentSummaryDto {
  return summaryOfDocument(documentFixture(changes));
}

// Bestiário is the only one every member reads: Carta is private, Trama sits in a private folder
// and Sumido in a folder this viewer was never sent.
const LIBRARY = vharnLibrary({
  folders: [ATO_1, CATACUMBAS, SEGREDOS],
  documents: [
    summaryOf({ name: 'Bestiário', visibility: 'public', folderId: CATACUMBAS.id }),
    summaryOf({ id: CARTA_ID, name: 'Carta', visibility: 'private' }),
    summaryOf({ id: TRAMA_ID, name: 'Trama', visibility: 'public', folderId: SEGREDOS.id }),
    summaryOf({
      id: SUMIDO_ID,
      name: 'Sumido',
      visibility: 'public',
      folderId: '20000000-0000-4000-8000-0000000000f2',
    }),
  ],
});
const ITEMS_CONTENT = {
  type: 'doc' as const,
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Goblin' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'PV 7' }] },
  ],
};

async function documentsHarness(
  setup: Readonly<{ permissions?: readonly 'documents:read'[]; canEdit?: boolean }> = {},
): Promise<SheetBridgeHarness> {
  const harness = await sheetBridgeHarness({ permissions: DOCUMENTS, ...setup });
  harness.library.answer('list', { ok: true, value: LIBRARY });
  harness.documents.document = documentFixture({ visibility: 'public', tabs: threeTabs() });
  harness.documents.tabBodies[ITEMS_TAB_ID] = documentTabFixture({
    ...threeTabs()[1],
    content: ITEMS_CONTENT,
  });
  return harness;
}

const list = { type: 'documents.list', requestId: '1' };
const tabsOf = (documentId: string) => ({ type: 'documents.tabs', requestId: '2', documentId });
const readTab = (documentId: string, tabId: string) => ({
  type: 'documents.readTab',
  requestId: '3',
  documentId,
  tabId,
});

function errorsOf(harness: SheetBridgeHarness): string[] {
  return harness.port.ofType('error').map(({ code }) => code);
}

describe('sheet bridge host: documents.list', () => {
  it('answers only the public documents outside private folders, with their folder path', async () => {
    const harness = await documentsHarness();
    await harness.frameSends(list);
    expect(harness.port.ofType('result')).toEqual([
      {
        type: 'result',
        requestId: '1',
        value: {
          documents: [{ id: DOCUMENT_ID, name: 'Bestiário', folderPath: ['Ato 1', 'Catacumbas'] }],
        },
      },
    ]);
  });

  it('reads the library of the sheet’s table', async () => {
    const harness = await documentsHarness();
    await harness.frameSends(list);
    expect(harness.library.calls.map(({ args }) => args[0])).toEqual([VHARN.id]);
  });

  it('without documents:read is PERMISSION_NOT_DECLARED and reads nothing', async () => {
    const harness = await documentsHarness({ permissions: [] });
    await harness.frameSends(list);
    expect({ codes: errorsOf(harness), calls: harness.library.calls.length }).toEqual({
      codes: ['PERMISSION_NOT_DECLARED'],
      calls: 0,
    });
  });

  it('answers a viewer who may not edit the sheet: reading needs no edit right', async () => {
    const harness = await documentsHarness({ canEdit: false });
    await harness.frameSends(list);
    expect({ codes: errorsOf(harness), results: harness.port.ofType('result').length }).toEqual({
      codes: [],
      results: 1,
    });
  });

  it('a library that does not load comes back as its failure', async () => {
    const harness = await documentsHarness();
    harness.library.answer('list', { ok: false, failure: { kind: 'offline' } });
    await harness.frameSends(list);
    expect(errorsOf(harness)).toEqual(['OFFLINE']);
  });

  it('a 61st read in 60 s is RATE_LIMITED, and the window reopens', async () => {
    const harness = await documentsHarness();
    for (let index = 0; index < 61; index += 1) await harness.frameSends(list);
    const limited = errorsOf(harness);
    harness.clock.advance(60_000);
    await harness.frameSends(list);
    expect({ limited, reads: harness.library.calls.length }).toEqual({
      limited: ['RATE_LIMITED'],
      reads: 61,
    });
  });
});

describe('sheet bridge host: documents.tabs', () => {
  it('answers the document tabs in order, without the masters-only one', async () => {
    const harness = await documentsHarness();
    await harness.frameSends(tabsOf(DOCUMENT_ID));
    expect(harness.port.ofType('result')[0]?.value).toEqual({
      tabs: [
        { id: threeTabs()[0]?.id, name: 'Geral' },
        { id: ITEMS_TAB_ID, name: 'Itens' },
      ],
    });
  });

  it.each([
    ['a private document', CARTA_ID],
    ['a public document in a private folder', TRAMA_ID],
    ['a document in a folder the viewer was not sent', SUMIDO_ID],
  ])('%s is DOCUMENT_NOT_FOUND without opening it', async (_case, documentId) => {
    const harness = await documentsHarness();
    await harness.frameSends(tabsOf(documentId));
    expect({ codes: errorsOf(harness), opened: harness.documents.detailCalls }).toEqual({
      codes: ['DOCUMENT_NOT_FOUND'],
      opened: 0,
    });
  });
});

describe('sheet bridge host: documents.readTab', () => {
  it('answers the tab body with its tree and its plain text', async () => {
    const harness = await documentsHarness();
    await harness.frameSends(readTab(DOCUMENT_ID, ITEMS_TAB_ID));
    expect(harness.port.ofType('result')[0]?.value).toEqual({
      tab: { id: ITEMS_TAB_ID, name: 'Itens', content: ITEMS_CONTENT, text: 'Goblin\nPV 7' },
    });
  });

  it('a masters-only tab is DOCUMENT_TAB_NOT_FOUND, even to a master', async () => {
    const harness = await documentsHarness();
    await harness.frameSends(readTab(DOCUMENT_ID, SECRETS_TAB_ID));
    expect({ codes: errorsOf(harness), results: harness.port.ofType('result') }).toEqual({
      codes: ['DOCUMENT_TAB_NOT_FOUND'],
      results: [],
    });
  });

  it('a tab the server does not find is DOCUMENT_TAB_NOT_FOUND', async () => {
    const harness = await documentsHarness();
    await harness.frameSends(readTab(DOCUMENT_ID, CARTA_ID));
    expect(errorsOf(harness)).toEqual(['DOCUMENT_TAB_NOT_FOUND']);
  });

  it('a tab of a private document is DOCUMENT_NOT_FOUND without reading it', async () => {
    const harness = await documentsHarness();
    await harness.frameSends(readTab(CARTA_ID, ITEMS_TAB_ID));
    expect({ codes: errorsOf(harness), reads: harness.documents.tabReads }).toEqual({
      codes: ['DOCUMENT_NOT_FOUND'],
      reads: [],
    });
  });
});
