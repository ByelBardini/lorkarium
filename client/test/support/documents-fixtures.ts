import type {
  DocumentContentDto,
  DocumentDto,
  DocumentWriteResponseDto,
} from '@lorkarium/contracts';

export const DOCUMENT_ID = '10000000-0000-4000-8000-000000000001';
export const DOCUMENT_ACTION_ID = '10000000-0000-4000-8000-000000000002';
export const DOCUMENT_CAMPAIGN_ID = '10000000-0000-4000-8000-000000000003';
export function documentText(text: string): DocumentContentDto {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
  };
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
    schemaVersion: 1,
    content: documentText('A'),
    ...changes,
  };
}
export function documentWrite(document: DocumentDto): DocumentWriteResponseDto {
  return {
    document,
    receipt: {
      actionId: DOCUMENT_ACTION_ID,
      documentId: document.id,
      version: document.version,
      operation: 'content',
    },
  };
}
