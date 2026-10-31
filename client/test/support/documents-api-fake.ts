import type {
  AssetDto,
  CreateDocumentRequestDto,
  CreateDocumentTabRequestDto,
  DeleteDocumentTabRequestDto,
  DocumentDto,
  DocumentTabDto,
  DocumentTabSummaryDto,
  DocumentTabWriteResponseDto,
  DocumentWriteResponseDto,
  ReorderDocumentTabsRequestDto,
  UpdateDocumentContentRequestDto,
  UpdateDocumentRequestDto,
  UpdateDocumentTabContentRequestDto,
  UpdateDocumentTabRequestDto,
} from '@lorkarium/contracts';
import type { DocumentsApi, DocumentsResult } from '@/services/documents-api';
import {
  documentFixture,
  documentTabFixture,
  documentText,
  documentWrite,
  tabWrite,
} from './documents-fixtures';

export type TabSave = UpdateDocumentTabContentRequestDto & { tabId: string };
export type TabCommandCall =
  | Readonly<{ operation: 'create'; input: CreateDocumentTabRequestDto }>
  | Readonly<{ operation: 'update'; tabId: string; input: UpdateDocumentTabRequestDto }>
  | Readonly<{ operation: 'reorder'; input: ReorderDocumentTabsRequestDto }>
  | Readonly<{ operation: 'remove'; tabId: string; input: DeleteDocumentTabRequestDto }>;
type Held<T> = (answer: DocumentsResult<T>) => void;
// Ids the fake hands to new tabs, in order.
const NEW_TAB_IDS = [
  '10000000-0000-4000-8000-0000000000b1',
  '10000000-0000-4000-8000-0000000000b2',
  '10000000-0000-4000-8000-0000000000b3',
];

/** An in-memory document with tabs: the tab list lives in `document.tabs`, each body in
 *  `tabBodies` (a tab without one reads as "A"). */
export class DocumentsApiFake implements DocumentsApi {
  document = documentFixture();
  tabBodies: Record<string, DocumentTabDto> = {};
  detailResult: DocumentsResult<DocumentDto> | null = null;
  saveResult: DocumentsResult<DocumentWriteResponseDto> | null = null;
  saves: UpdateDocumentContentRequestDto[] = [];
  updates: UpdateDocumentRequestDto[] = [];
  updateResult: DocumentsResult<DocumentWriteResponseDto> | null = null;
  imageResult: DocumentsResult<AssetDto> = { ok: false, failure: { kind: 'offline' } };
  imageRequests: {
    operation: 'upload' | 'import' | 'library';
    campaignId: string;
    documentId: string;
    tabId: string;
    file?: Blob;
    source?: string;
  }[] = [];
  heldSave: Held<DocumentWriteResponseDto> | null = null;
  holdSave = false;
  detailCalls = 0;
  heldDetail: Promise<DocumentsResult<DocumentDto>> | null = null;
  tabReads: string[] = [];
  tabResults: Record<string, DocumentsResult<DocumentTabDto>> = {};
  tabSaves: TabSave[] = [];
  tabSaveResults: Record<string, DocumentsResult<DocumentTabWriteResponseDto>> = {};
  heldTabSaves: Record<string, Held<DocumentTabWriteResponseDto>> = {};
  holdTabSaves = false;
  tabCommands: TabCommandCall[] = [];
  tabCommandResult: DocumentsResult<DocumentWriteResponseDto> | null = null;
  async detail(): Promise<DocumentsResult<DocumentDto>> {
    this.detailCalls++;
    if (this.heldDetail) return this.heldDetail;
    return this.detailResult ?? { ok: true, value: this.document };
  }
  async create(
    _campaignId: string,
    input: CreateDocumentRequestDto,
  ): Promise<DocumentsResult<DocumentWriteResponseDto>> {
    this.document = documentFixture({
      name: input.name ?? 'Documento sem nome',
      folderId: input.folderId ?? null,
    });
    return { ok: true, value: documentWrite(this.document) };
  }
  async save(
    _campaignId: string,
    _documentId: string,
    input: UpdateDocumentContentRequestDto,
  ): Promise<DocumentsResult<DocumentWriteResponseDto>> {
    this.saves.push(input);
    if (this.holdSave)
      return new Promise((resolve) => {
        this.heldSave = resolve;
      });
    if (this.saveResult) return this.saveResult;
    this.document = { ...this.document, name: input.name, version: input.expectedVersion + 1 };
    return { ok: true, value: documentWrite(this.document) };
  }
  async update(
    _campaignId: string,
    _documentId: string,
    input: UpdateDocumentRequestDto,
  ): Promise<DocumentsResult<DocumentWriteResponseDto>> {
    this.updates.push(input);
    if (this.updateResult) return this.updateResult;
    this.document = {
      ...this.document,
      ...administrationOf(input),
      version: input.expectedVersion + 1,
    };
    return { ok: true, value: documentWrite(this.document) };
  }
  async remove(): Promise<DocumentsResult<null>> {
    return { ok: true, value: null };
  }
  async uploadImage(
    campaignId: string,
    documentId: string,
    tabId: string,
    file: Blob,
  ): Promise<DocumentsResult<AssetDto>> {
    this.imageRequests.push({ operation: 'upload', campaignId, documentId, tabId, file });
    return this.imageResult;
  }
  async importImage(
    campaignId: string,
    documentId: string,
    tabId: string,
    source: string,
  ): Promise<DocumentsResult<AssetDto>> {
    this.imageRequests.push({ operation: 'import', campaignId, documentId, tabId, source });
    return this.imageResult;
  }
  async libraryImage(
    campaignId: string,
    documentId: string,
    tabId: string,
    source: string,
  ): Promise<DocumentsResult<AssetDto>> {
    this.imageRequests.push({ operation: 'library', campaignId, documentId, tabId, source });
    return this.imageResult;
  }
  async tab(
    _campaignId: string,
    _documentId: string,
    tabId: string,
  ): Promise<DocumentsResult<DocumentTabDto>> {
    this.tabReads.push(tabId);
    const answer = this.tabResults[tabId];
    if (answer) return answer;
    const body = this.bodyOf(tabId);
    return body ? { ok: true, value: body } : { ok: false, failure: { kind: 'not_found' } };
  }
  async saveTab(
    _campaignId: string,
    _documentId: string,
    tabId: string,
    input: UpdateDocumentTabContentRequestDto,
  ): Promise<DocumentsResult<DocumentTabWriteResponseDto>> {
    this.tabSaves.push({ ...input, tabId });
    if (this.holdTabSaves)
      return new Promise((resolve) => {
        this.heldTabSaves[tabId] = resolve;
      });
    const answer = this.tabSaveResults[tabId];
    if (answer) return answer;
    const body = this.bodyOf(tabId);
    if (!body) return { ok: false, failure: { kind: 'not_found' } };
    this.writeTab({ ...body, content: input.content, version: input.expectedVersion + 1 });
    return { ok: true, value: tabWrite(summaryOf(this.tabBodies[tabId]!)) };
  }
  async createTab(
    _campaignId: string,
    _documentId: string,
    input: CreateDocumentTabRequestDto,
  ): Promise<DocumentsResult<DocumentWriteResponseDto>> {
    this.tabCommands.push({ operation: 'create', input });
    if (this.tabCommandResult) return this.tabCommandResult;
    const id = NEW_TAB_IDS.find(
      (candidate) => !this.document.tabs.some((tab) => tab.id === candidate),
    );
    const tab = documentTabFixture({
      id: id!,
      name: input.name ?? 'Nova aba',
      content: documentText(''),
    });
    this.writeTab(tab);
    return this.bumped(input.expectedVersion, 'tab-create', tab.id);
  }
  async updateTab(
    _campaignId: string,
    _documentId: string,
    tabId: string,
    input: UpdateDocumentTabRequestDto,
  ): Promise<DocumentsResult<DocumentWriteResponseDto>> {
    this.tabCommands.push({ operation: 'update', tabId, input });
    if (this.tabCommandResult) return this.tabCommandResult;
    const changes = {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
    };
    this.document = {
      ...this.document,
      tabs: this.document.tabs.map((tab) => (tab.id === tabId ? { ...tab, ...changes } : tab)),
    };
    return this.bumped(input.expectedVersion, 'tab-update', tabId);
  }
  async reorderTabs(
    _campaignId: string,
    _documentId: string,
    input: ReorderDocumentTabsRequestDto,
  ): Promise<DocumentsResult<DocumentWriteResponseDto>> {
    this.tabCommands.push({ operation: 'reorder', input });
    if (this.tabCommandResult) return this.tabCommandResult;
    const byId = new Map(this.document.tabs.map((tab) => [tab.id, tab]));
    const tabs = input.tabIds.flatMap((id) => byId.get(id) ?? []);
    this.document = { ...this.document, tabs };
    return this.bumped(input.expectedVersion, 'tab-reorder');
  }
  async removeTab(
    _campaignId: string,
    _documentId: string,
    tabId: string,
    input: DeleteDocumentTabRequestDto,
  ): Promise<DocumentsResult<DocumentWriteResponseDto>> {
    this.tabCommands.push({ operation: 'remove', tabId, input });
    if (this.tabCommandResult) return this.tabCommandResult;
    this.document = { ...this.document, tabs: this.document.tabs.filter(({ id }) => id !== tabId) };
    return this.bumped(input.expectedVersion, 'tab-delete', tabId);
  }
  /** Writes a tab body, adding the tab to the document's list when it is new. */
  writeTab(tab: DocumentTabDto): void {
    this.tabBodies[tab.id] = tab;
    const summary = summaryOf(tab);
    const listed = this.document.tabs.some(({ id }) => id === tab.id);
    const tabs = listed
      ? this.document.tabs.map((current) => (current.id === tab.id ? summary : current))
      : [...this.document.tabs, summary];
    this.document = { ...this.document, tabs };
  }
  private bodyOf(tabId: string): DocumentTabDto | undefined {
    const summary = this.document.tabs.find(({ id }) => id === tabId);
    if (!summary) return undefined;
    return this.tabBodies[tabId] ?? documentTabFixture({ ...summary });
  }
  private bumped(
    expectedVersion: number,
    operation: DocumentWriteResponseDto['receipt']['operation'],
    tabId?: string,
  ): DocumentsResult<DocumentWriteResponseDto> {
    this.document = { ...this.document, version: expectedVersion + 1 };
    return { ok: true, value: documentWrite(this.document, operation, tabId) };
  }
}

function summaryOf(tab: DocumentTabDto): DocumentTabSummaryDto {
  return {
    id: tab.id,
    name: tab.name,
    visibility: tab.visibility,
    version: tab.version,
    updatedAt: tab.updatedAt,
  };
}
function administrationOf(input: UpdateDocumentRequestDto): Partial<DocumentDto> {
  return {
    ...(input.folderId === undefined ? {} : { folderId: input.folderId }),
    ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
    ...(input.ownerIds === undefined ? {} : { ownerIds: input.ownerIds }),
  };
}
