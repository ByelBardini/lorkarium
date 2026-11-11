import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_TABS_MAX,
  SCENE_FOLDER_DEPTH_MAX,
  sheetFrameDocumentTabContentDto,
  sheetFrameMessageDto,
  sheetHostMessageDto,
} from '../../src';

const documentId = '00000000-0000-4000-8000-000000000010';
const tabId = '00000000-0000-4000-8000-000000000011';
const content = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Goblin' }] }],
};

function resultWith(value: unknown): unknown {
  return { type: 'result', requestId: '7', value };
}

describe('document reads from the frame', () => {
  it('accepts documents.list with only the request id', () =>
    expect(sheetFrameMessageDto.parse({ type: 'documents.list', requestId: '1' })).toEqual({
      type: 'documents.list',
      requestId: '1',
    }));
  it('refuses a campaign id in documents.list: the host knows the table', () =>
    expect(
      sheetFrameMessageDto.safeParse({ type: 'documents.list', requestId: '1', campaignId: tabId })
        .success,
    ).toBe(false));
  it('accepts documents.tabs with a document id', () =>
    expect(
      sheetFrameMessageDto.safeParse({ type: 'documents.tabs', requestId: '1', documentId })
        .success,
    ).toBe(true));
  it('refuses a document named instead of identified', () =>
    expect(
      sheetFrameMessageDto.safeParse({
        type: 'documents.tabs',
        requestId: '1',
        documentId: 'Bestiário',
      }).success,
    ).toBe(false));
  it('accepts documents.readTab with the document and the tab', () =>
    expect(
      sheetFrameMessageDto.safeParse({
        type: 'documents.readTab',
        requestId: '1',
        documentId,
        tabId,
      }).success,
    ).toBe(true));
  it('refuses documents.readTab without the tab', () =>
    expect(
      sheetFrameMessageDto.safeParse({ type: 'documents.readTab', requestId: '1', documentId })
        .success,
    ).toBe(false));
});

describe('document read results', () => {
  const lista = { documents: [{ id: documentId, name: 'Bestiário', folderPath: ['Mundo'] }] };

  it('carries the document list with each folder path', () =>
    expect(sheetHostMessageDto.parse(resultWith(lista))).toEqual(resultWith(lista)));
  it('refuses a folder path deeper than the library allows', () => {
    const deep = Array.from({ length: SCENE_FOLDER_DEPTH_MAX + 1 }, (_, index) => `P${index}`);
    const value = { documents: [{ id: documentId, name: 'Fundo', folderPath: deep }] };
    expect(sheetHostMessageDto.safeParse(resultWith(value)).success).toBe(false);
  });
  it('refuses a document carrying its visibility: the frame never learns it', () => {
    const value = { documents: [{ ...lista.documents[0], visibility: 'public' }] };
    expect(sheetHostMessageDto.safeParse(resultWith(value)).success).toBe(false);
  });
  it('carries the tabs and refuses one past the document limit', () => {
    const tab = { id: tabId, name: 'Geral' };
    expect(sheetHostMessageDto.safeParse(resultWith({ tabs: [tab] })).success).toBe(true);
    const tooMany = { tabs: Array.from({ length: DOCUMENT_TABS_MAX + 1 }, () => tab) };
    expect(sheetHostMessageDto.safeParse(resultWith(tooMany)).success).toBe(false);
  });
  it('carries a tab body with its tree and its text', () => {
    const tab = { id: tabId, name: 'Geral', content, text: 'Goblin' };
    expect(sheetHostMessageDto.parse(resultWith({ tab }))).toEqual(resultWith({ tab }));
  });
  it('refuses a tab body whose tree the document contract would refuse', () =>
    expect(
      sheetFrameDocumentTabContentDto.safeParse({
        id: tabId,
        name: 'Geral',
        content: { type: 'doc', content: [{ type: 'script' }] },
        text: '',
      }).success,
    ).toBe(false));
});
