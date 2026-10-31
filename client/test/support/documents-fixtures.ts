import type {
  DocumentContentDto,
  DocumentDto,
  DocumentTabDto,
  DocumentTabSummaryDto,
  DocumentTabWriteResponseDto,
  DocumentWriteResponseDto,
} from '@lorkarium/contracts';

export const DOCUMENT_ID = '10000000-0000-4000-8000-000000000001';
export const DOCUMENT_ACTION_ID = '10000000-0000-4000-8000-000000000002';
export const DOCUMENT_CAMPAIGN_ID = '10000000-0000-4000-8000-000000000003';
/** "Geral", the tab every document is born with. */
export const GENERAL_TAB_ID = '10000000-0000-4000-8000-0000000000a1';
export const ITEMS_TAB_ID = '10000000-0000-4000-8000-0000000000a2';
export const SECRETS_TAB_ID = '10000000-0000-4000-8000-0000000000a3';
export function documentText(text: string): DocumentContentDto {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
  };
}
export function tabSummaryFixture(
  changes: Partial<DocumentTabSummaryDto> = {},
): DocumentTabSummaryDto {
  return {
    id: GENERAL_TAB_ID,
    name: 'Geral',
    visibility: 'document',
    version: 0,
    updatedAt: '2026-10-29T12:00:00.000Z',
    ...changes,
  };
}
/** The three tabs of the scenarios: "Geral", "Itens" and the masters-only "Segredos". */
export function threeTabs(): DocumentTabSummaryDto[] {
  return [
    tabSummaryFixture(),
    tabSummaryFixture({ id: ITEMS_TAB_ID, name: 'Itens' }),
    tabSummaryFixture({ id: SECRETS_TAB_ID, name: 'Segredos', visibility: 'masters' }),
  ];
}
export function documentTabFixture(changes: Partial<DocumentTabDto> = {}): DocumentTabDto {
  return { ...tabSummaryFixture(), schemaVersion: 1, content: documentText('A'), ...changes };
}
export function documentFixture(changes: Partial<DocumentDto> = {}): DocumentDto {
  return {
    id: DOCUMENT_ID,
    name: 'Carta',
    folderId: null,
    visibility: 'private',
    version: 0,
    updatedAt: '2026-10-29T12:00:00.000Z',
    canEdit: true,
    canManage: true,
    ownerIds: [],
    schemaVersion: 2,
    tabs: [tabSummaryFixture()],
    ...changes,
  };
}
export function documentWrite(
  document: DocumentDto,
  operation: DocumentWriteResponseDto['receipt']['operation'] = 'content',
  tabId?: string,
): DocumentWriteResponseDto {
  return {
    document,
    receipt: {
      actionId: DOCUMENT_ACTION_ID,
      documentId: document.id,
      ...(tabId ? { tabId } : {}),
      version: document.version,
      operation,
    },
  };
}
export function tabWrite(tab: DocumentTabSummaryDto): DocumentTabWriteResponseDto {
  return {
    tab,
    receipt: {
      actionId: DOCUMENT_ACTION_ID,
      documentId: DOCUMENT_ID,
      tabId: tab.id,
      version: tab.version,
      operation: 'tab-content',
    },
  };
}
