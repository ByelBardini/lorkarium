import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_TABS_MAX,
  EMPTY_DOCUMENT_CONTENT,
  createDocumentTabRequestDto,
  documentDto,
  documentReceiptDto,
  documentTabDto,
  reorderDocumentTabsRequestDto,
  updateDocumentTabContentRequestDto,
  updateDocumentTabRequestDto,
} from '../../src';

const actionId = '00000000-0000-4000-8000-000000000001';
const action = { actionId, expectedVersion: 3 };
const updatedAt = '2026-10-31T12:00:00.000Z';
const tabSummary = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Segredos',
  visibility: 'masters',
  version: 0,
  updatedAt,
};
const documentSummary = {
  id: '00000000-0000-4000-8000-000000000003',
  name: 'Carta',
  folderId: null,
  visibility: 'public',
  version: 1,
  updatedAt,
  canEdit: true,
  canManage: true,
};
const tabIds = (count: number): string[] =>
  Array.from(
    { length: count },
    (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  );

describe('document tab commands', () => {
  it('creating a tab trims its name', () => {
    expect(createDocumentTabRequestDto.parse({ ...action, name: '  Itens ' })).toEqual({
      ...action,
      name: 'Itens',
    });
  });
  it('a tab name of 40 characters is accepted and of 41 is refused', () => {
    expect(createDocumentTabRequestDto.safeParse({ ...action, name: 'x'.repeat(40) }).success).toBe(
      true,
    );
    expect(createDocumentTabRequestDto.safeParse({ ...action, name: 'x'.repeat(41) }).success).toBe(
      false,
    );
  });
  it('reordering accepts 200 tabs and refuses 201', () => {
    expect(DOCUMENT_TABS_MAX).toBe(200);
    expect(
      reorderDocumentTabsRequestDto.safeParse({ ...action, tabIds: tabIds(200) }).success,
    ).toBe(true);
    expect(
      reorderDocumentTabsRequestDto.safeParse({ ...action, tabIds: tabIds(201) }).success,
    ).toBe(false);
  });
  it('reordering with a repeated tab id is refused citing uniqueness', () => {
    const [first = '', second = ''] = tabIds(2);
    const result = reorderDocumentTabsRequestDto.safeParse({
      ...action,
      tabIds: [first, second, first],
    });
    expect(result.error?.issues[0]?.message).toBe('Expected unique document tab IDs');
  });
  it('a tab update without any change is refused', () => {
    expect(updateDocumentTabRequestDto.safeParse(action).success).toBe(false);
    expect(updateDocumentTabRequestDto.parse({ ...action, visibility: 'document' })).toEqual({
      ...action,
      visibility: 'document',
    });
  });
  it('a tab content patch carries the content against the tab version', () => {
    expect(
      updateDocumentTabContentRequestDto.parse({ ...action, content: EMPTY_DOCUMENT_CONTENT }),
    ).toEqual({ ...action, content: EMPTY_DOCUMENT_CONTENT });
    expect(updateDocumentTabContentRequestDto.safeParse(action).success).toBe(false);
  });
});

describe('document tab responses', () => {
  it('a masters-only tab with its content is accepted', () => {
    const tab = { ...tabSummary, schemaVersion: 1, content: EMPTY_DOCUMENT_CONTENT };
    expect(documentTabDto.parse(tab)).toEqual(tab);
  });
  it('a tab with visibility secret is refused', () => {
    const tab = { ...tabSummary, visibility: 'secret', schemaVersion: 1 };
    expect(documentTabDto.safeParse({ ...tab, content: EMPTY_DOCUMENT_CONTENT }).success).toBe(
      false,
    );
  });
  it('the document carries tab summaries at schema version 2 and is refused without tabs', () => {
    const document = { ...documentSummary, schemaVersion: 2, tabs: [tabSummary] };
    expect(documentDto.parse(document)).toEqual(document);
    expect(documentDto.safeParse({ ...documentSummary, schemaVersion: 2 }).success).toBe(false);
    expect(documentDto.safeParse({ ...document, schemaVersion: 1 }).success).toBe(false);
  });
  it('a receipt of a tab operation names the tab', () => {
    const receipt = {
      actionId,
      documentId: documentSummary.id,
      tabId: tabSummary.id,
      version: 4,
      operation: 'tab-content',
    };
    expect(documentReceiptDto.parse(receipt)).toEqual(receipt);
    expect(documentReceiptDto.safeParse({ ...receipt, operation: 'tab-move' }).success).toBe(false);
  });
});
