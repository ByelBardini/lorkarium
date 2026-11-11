import { beforeEach, describe, expect, it } from 'vitest';
import { SHEET_BRIDGE_BOOTSTRAP } from '@/sheet-sandbox/sheet-bridge-bootstrap';
import { SheetFrameWindowFake, SheetPortFake } from '../support/sheet-frame-fakes';

const DOCUMENT_ID = '10000000-0000-4000-8000-000000000001';
const TAB_ID = '10000000-0000-4000-8000-0000000000a2';
const ITEMS = {
  id: TAB_ID,
  name: 'Itens',
  content: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Goblin' }] }],
  },
  text: 'Goblin',
};

let frame: SheetFrameWindowFake;
let port: SheetPortFake;

// The exact text the srcdoc embeds, run with the fake as its `window`.
beforeEach(() => {
  frame = new SheetFrameWindowFake();
  new Function('window', SHEET_BRIDGE_BOOTSTRAP)(frame);
  port = new SheetPortFake();
  frame.handOff(port);
});

describe('sheet bridge bootstrap: documents', () => {
  it('documents.list asks with only the request id', () => {
    void frame.sdk.documents.list();
    expect(port.sent).toEqual([{ type: 'documents.list', requestId: '1' }]);
  });

  it('documents.tabs and documents.readTab send the ids as given', () => {
    void frame.sdk.documents.tabs(DOCUMENT_ID);
    void frame.sdk.documents.readTab(DOCUMENT_ID, TAB_ID);
    expect(port.sent).toEqual([
      { type: 'documents.tabs', requestId: '1', documentId: DOCUMENT_ID },
      { type: 'documents.readTab', requestId: '2', documentId: DOCUMENT_ID, tabId: TAB_ID },
    ]);
  });

  it('documents.list resolves with the list itself, not its wrapper', async () => {
    const listed = frame.sdk.documents.list();
    const documents = [{ id: DOCUMENT_ID, name: 'Bestiário', folderPath: ['Mundo'] }];
    port.deliver({ type: 'result', requestId: '1', value: { documents } });
    expect(await listed).toEqual(documents);
  });

  it('documents.tabs resolves with the tabs', async () => {
    const tabs = frame.sdk.documents.tabs(DOCUMENT_ID);
    port.deliver({
      type: 'result',
      requestId: '1',
      value: { tabs: [{ id: TAB_ID, name: 'Itens' }] },
    });
    expect(await tabs).toEqual([{ id: TAB_ID, name: 'Itens' }]);
  });

  it('documents.readTab resolves with a copy of the tab: changing it leaves the answer alone', async () => {
    const value = { tab: ITEMS };
    const read = frame.sdk.documents.readTab(DOCUMENT_ID, TAB_ID);
    port.deliver({ type: 'result', requestId: '1', value });
    const tab = await read;
    (tab as { text: string }).text = 'mudado';
    expect({ tab: tab.name, delivered: value.tab.text }).toEqual({
      tab: 'Itens',
      delivered: 'Goblin',
    });
  });

  it('rejects with the host code when the document is not public', async () => {
    const read = frame.sdk.documents
      .tabs(DOCUMENT_ID)
      .catch((error: Error & { code?: string }) => error.code);
    port.deliver({ type: 'error', requestId: '1', code: 'DOCUMENT_NOT_FOUND', message: 'no' });
    expect(await read).toBe('DOCUMENT_NOT_FOUND');
  });
});
