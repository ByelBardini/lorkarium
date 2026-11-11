import type {
  CampaignLibraryDto,
  SceneFolderDto,
  SheetFrameDocumentDto,
  SheetFrameRequestDto,
} from '@lorkarium/contracts';
import { documentPlainText } from '@/lib/document-plain-text';
import type { DocumentsApi } from '@/services/documents-api';
import type { LibraryApi } from '@/services/library-api';
import { refusedByKind, refusedWith, type SheetBridgeAnswer } from './sheet-bridge-answer';

/** Where the sheet's document reads go: the library (which documents and folders) and the
 *  documents themselves, both with the viewer's own session. */
export type SheetDocumentSources = Readonly<{
  library: Pick<LibraryApi, 'list'>;
  documents: Pick<DocumentsApi, 'detail' | 'tab'>;
}>;

export type SheetDocumentRead = Extract<
  SheetFrameRequestDto,
  { type: 'documents.list' | 'documents.tabs' | 'documents.readTab' }
>;

/** Whether a frame request is a document read (`documents.*`).
 *
 *  Example: `if (isSheetDocumentRead(request)) return readSheetDocuments(sources, campaignId, request)` */
export function isSheetDocumentRead(request: SheetFrameRequestDto): request is SheetDocumentRead {
  return request.type.startsWith('documents.');
}

/** Answers a document read with only what every member of the table reads: public documents
 *  outside private folders and their `document` tabs. Anything else is not found, for a master
 *  too, so a sheet never shows one viewer what another would not see.
 *
 *  Example: `await readSheetDocuments(sources, campaignId, { type: 'documents.list', requestId: '1' })` */
export function readSheetDocuments(
  sources: SheetDocumentSources,
  campaignId: string,
  request: SheetDocumentRead,
): Promise<SheetBridgeAnswer> {
  switch (request.type) {
    case 'documents.list':
      return listDocuments(sources, campaignId);
    case 'documents.tabs':
      return listTabs(sources, campaignId, request.documentId);
    case 'documents.readTab':
      return readTab(sources, campaignId, request.documentId, request.tabId);
  }
}

async function listDocuments(
  sources: SheetDocumentSources,
  campaignId: string,
): Promise<SheetBridgeAnswer> {
  const library = await sources.library.list(campaignId);
  if (!library.ok) return refusedByKind('documents.list', library.failure.kind);
  return { ok: true, value: { documents: publicDocumentsOf(library.value) } };
}

async function listTabs(
  sources: SheetDocumentSources,
  campaignId: string,
  documentId: string,
): Promise<SheetBridgeAnswer> {
  const refusal = await publicDocumentRefusal(sources, campaignId, documentId, 'documents.tabs');
  if (refusal) return refusal;
  const detail = await sources.documents.detail(campaignId, documentId);
  if (!detail.ok) return documentRefusalOf('documents.tabs', documentId, detail.failure.kind);
  const shown = detail.value.tabs.filter((tab) => tab.visibility === 'document');
  return { ok: true, value: { tabs: shown.map(({ id, name }) => ({ id, name })) } };
}

async function readTab(
  sources: SheetDocumentSources,
  campaignId: string,
  documentId: string,
  tabId: string,
): Promise<SheetBridgeAnswer> {
  const refusal = await publicDocumentRefusal(sources, campaignId, documentId, 'documents.readTab');
  if (refusal) return refusal;
  const read = await sources.documents.tab(campaignId, documentId, tabId);
  if (!read.ok && read.failure.kind !== 'not_found')
    return refusedByKind('documents.readTab', read.failure.kind);
  if (!read.ok || read.value.visibility !== 'document') return tabNotFound(tabId);
  const { id, name, content } = read.value;
  return { ok: true, value: { tab: { id, name, content, text: documentPlainText(content) } } };
}

// The library says which documents are public and in which folders: a master's detail alone
// would also answer a hidden one.
async function publicDocumentRefusal(
  sources: SheetDocumentSources,
  campaignId: string,
  documentId: string,
  request: string,
): Promise<SheetBridgeAnswer | null> {
  const library = await sources.library.list(campaignId);
  if (!library.ok) return refusedByKind(request, library.failure.kind);
  const known = publicDocumentsOf(library.value).some((document) => document.id === documentId);
  return known ? null : documentNotFound(request, documentId);
}

function documentRefusalOf(request: string, documentId: string, kind: string): SheetBridgeAnswer {
  if (kind === 'not_found' || kind === 'forbidden') return documentNotFound(request, documentId);
  return refusedByKind(request, kind);
}

function documentNotFound(request: string, documentId: string): SheetBridgeAnswer {
  const message = `${request}: no public document ${documentId}; expected an id from documents.list`;
  return refusedWith('DOCUMENT_NOT_FOUND', message);
}

function tabNotFound(tabId: string): SheetBridgeAnswer {
  const message = `documents.readTab: no tab ${tabId}; expected an id from documents.tabs`;
  return refusedWith('DOCUMENT_TAB_NOT_FOUND', message);
}

/** The public documents of the library outside private folders, each with its folder names
 *  from the root, in the library's order.
 *
 *  Example: `publicDocumentsOf(library) // [{ id, name: 'Bestiário', folderPath: ['Mundo'] }]` */
export function publicDocumentsOf(library: CampaignLibraryDto): SheetFrameDocumentDto[] {
  const folders = new Map(library.folders.map((folder) => [folder.id, folder]));
  return library.documents.flatMap((document) => {
    if (document.visibility !== 'public') return [];
    const folderPath = publicFolderPathOf(folders, document.folderId);
    return folderPath === null ? [] : [{ id: document.id, name: document.name, folderPath }];
  });
}

// `null` = a private folder on the way, or one this viewer was not sent (hidden from them).
function publicFolderPathOf(
  folders: ReadonlyMap<string, SceneFolderDto>,
  folderId: string | null,
): string[] | null {
  const path: string[] = [];
  for (let id = folderId; id !== null;) {
    const folder = folders.get(id);
    if (folder === undefined || folder.visibility !== 'public' || path.length > folders.size)
      return null;
    path.unshift(folder.name);
    id = folder.parentId;
  }
  return path;
}
