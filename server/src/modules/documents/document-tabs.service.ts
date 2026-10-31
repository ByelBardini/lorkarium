import {
  EMPTY_DOCUMENT_CONTENT,
  UNNAMED_DOCUMENT_TAB_NAME,
  type CreateDocumentTabRequestDto,
  type DeleteDocumentTabRequestDto,
  type DocumentContentDto,
  type DocumentReceiptDto,
  type DocumentTabDto,
  type DocumentTabWriteResponseDto,
  type DocumentWriteResponseDto,
  type ReorderDocumentTabsRequestDto,
  type UpdateDocumentTabContentRequestDto,
  type UpdateDocumentTabRequestDto,
} from '@lorkarium/contracts';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { viewerAccessOf } from '../campaigns/member-access';
import type { LibraryRequester } from '../library/library.service';
import type { DocumentTabSummaryPo } from './document-tabs.po';
import { DocumentTabsBo } from './document-tabs.bo';
import { toDocumentTabDto, toDocumentTabSummaryDto } from './document-tabs.mapper';
import {
  DocumentError,
  DocumentTabNotFoundError,
  DocumentTabVersionConflictError,
} from './documents.error';
import {
  DocumentWriteSteps,
  commandFingerprint,
  documentAssetIds,
  type Applied,
  type DocumentDaos,
  type DocumentScope,
  type DocumentsServiceDeps,
} from './document-writes.service';

type TabOperation = 'tab-create' | 'tab-update' | 'tab-reorder' | 'tab-delete';
type StructuralInput = Readonly<{ actionId: string; expectedVersion: number }>;
type TabsScope = DocumentScope & Readonly<{ tabs: DocumentTabsBo<DocumentTabSummaryPo> }>;
/** Checks the change against the tabs (throwing before anything is written) and returns the
 *  write, which answers the tab it touched, if any, for the receipt. */
type Change = (scope: TabsScope) => () => Promise<string | undefined>;

/** The tabs of a document: read one, create, rename/hide, reorder, delete and save a body.
 *  Structural changes bump the document version; a body bumps only its own tab.
 *
 *  Example: `await tabs.create(requester, documentId, { actionId, expectedVersion: 3 })` */
export class DocumentTabsService {
  private readonly steps: DocumentWriteSteps;
  constructor(private readonly deps: DocumentsServiceDeps) {
    this.steps = new DocumentWriteSteps(deps);
  }
  async get(
    requester: LibraryRequester,
    documentId: string,
    tabId: string,
  ): Promise<DocumentTabDto> {
    return this.deps.snapshot(async (daos) => {
      const access = await viewerAccessOf(daos.members, requester.campaignId, requester.userId);
      const scope = await this.tabsScope(daos, access, documentId);
      scope.tabs.requireVisible(tabId);
      const tab = await daos.tabs.findInDocument(requester.campaignId, documentId, tabId);
      if (!tab) throw new DocumentTabNotFoundError(documentId, tabId);
      return toDocumentTabDto(tab);
    });
  }
  async create(
    requester: LibraryRequester,
    documentId: string,
    input: CreateDocumentTabRequestDto,
  ): Promise<DocumentWriteResponseDto> {
    return this.structural(requester, documentId, input, 'tab-create', (scope) => {
      const position = scope.tabs.requireCreate();
      return async () => {
        const tab = await scope.daos.tabs.insert({
          id: this.deps.newId(),
          campaignId: requester.campaignId,
          documentId,
          name: input.name ?? UNNAMED_DOCUMENT_TAB_NAME,
          position,
          content: EMPTY_DOCUMENT_CONTENT,
        });
        return tab.id;
      };
    });
  }
  async update(
    requester: LibraryRequester,
    documentId: string,
    tabId: string,
    input: UpdateDocumentTabRequestDto,
  ): Promise<DocumentWriteResponseDto> {
    const change: Change = (scope) => {
      if (input.visibility !== undefined) scope.tabs.requireVisibilityChange(tabId);
      else scope.tabs.requireEdit(tabId);
      return async () => {
        await scope.daos.tabs.update(requester.campaignId, documentId, tabId, {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
          updatedAt: this.steps.now(),
        });
        return tabId;
      };
    };
    return this.structural(requester, documentId, input, 'tab-update', change, tabId);
  }
  async reorder(
    requester: LibraryRequester,
    documentId: string,
    input: ReorderDocumentTabsRequestDto,
  ): Promise<DocumentWriteResponseDto> {
    return this.structural(requester, documentId, input, 'tab-reorder', (scope) => {
      const order = scope.tabs.mergedOrder(input.tabIds);
      return async () => {
        await scope.daos.tabs.reorder(requester.campaignId, documentId, order);
        return undefined;
      };
    });
  }
  async delete(
    requester: LibraryRequester,
    documentId: string,
    tabId: string,
    input: DeleteDocumentTabRequestDto,
  ): Promise<DocumentWriteResponseDto> {
    const change: Change = (scope) => {
      scope.tabs.requireDelete(tabId);
      return async () => {
        await scope.daos.tabs.delete(requester.campaignId, documentId, tabId);
        return tabId;
      };
    };
    return this.structural(requester, documentId, input, 'tab-delete', change, tabId);
  }
  /** Saves the body of one tab against the tab's own version; other tabs never conflict. */
  async updateContent(
    requester: LibraryRequester,
    documentId: string,
    tabId: string,
    input: UpdateDocumentTabContentRequestDto,
  ): Promise<DocumentTabWriteResponseDto> {
    const result = await this.deps.transaction(async (daos) => {
      const access = await this.steps.lockedAccess(daos, requester);
      const scope = await this.tabsScope(daos, access, documentId);
      const tab = scope.tabs.requireEdit(tabId);
      const fingerprint = commandFingerprint('tab-content', tabId, input);
      const previous = await this.steps.previous(daos, requester, input.actionId, fingerprint);
      if (previous)
        return { value: { tab: toDocumentTabSummaryDto(tab), receipt: previous }, changed: false };
      if (tab.version !== input.expectedVersion)
        throw new DocumentTabVersionConflictError(tabId, input.expectedVersion, tab.version);
      const value = await this.saveBody(scope, tabId, input);
      await this.steps.record(daos, requester, value.receipt, fingerprint);
      return { value, changed: true };
    });
    return this.steps.published(requester.campaignId, result);
  }
  private async saveBody(
    scope: TabsScope,
    tabId: string,
    input: UpdateDocumentTabContentRequestDto,
  ): Promise<DocumentTabWriteResponseDto> {
    const { campaignId, id: documentId } = scope.row;
    await this.confirmAssets(scope, tabId, input.content);
    const saved = await scope.daos.tabs.saveContent(campaignId, documentId, tabId, {
      content: input.content,
      updatedAt: this.steps.now(),
    });
    const receipt: DocumentReceiptDto = {
      actionId: input.actionId,
      documentId,
      tabId,
      version: saved.version,
      operation: 'tab-content',
    };
    return { tab: toDocumentTabSummaryDto(saved), receipt };
  }
  private async structural(
    requester: LibraryRequester,
    documentId: string,
    input: StructuralInput,
    operation: TabOperation,
    change: Change,
    targetId: string = documentId,
  ): Promise<DocumentWriteResponseDto> {
    const result = await this.deps.transaction(async (daos) => {
      const access = await this.steps.lockedAccess(daos, requester);
      const scope = await this.tabsScope(daos, access, documentId);
      const fingerprint = commandFingerprint(operation, targetId, input);
      const previous = await this.steps.previous(daos, requester, input.actionId, fingerprint);
      if (previous) return this.replay(scope, previous);
      const apply = change(scope);
      scope.document.requireVersion(input.expectedVersion);
      const tabId = await apply();
      const row = await this.steps.bumpDocument(scope);
      const receipt = receiptOf(input.actionId, row.id, row.version, operation, tabId);
      await this.steps.record(daos, requester, receipt, fingerprint);
      return {
        value: { document: await this.steps.view(daos, access, row), receipt },
        changed: true,
      };
    });
    return this.steps.published(requester.campaignId, result);
  }
  private async tabsScope(
    daos: DocumentDaos,
    access: CampaignAccessBo,
    documentId: string,
  ): Promise<TabsScope> {
    const scope = await this.steps.scopeOf(daos, access, documentId);
    const tabs = await daos.tabs.listOfDocument(scope.row.campaignId, documentId);
    return { ...scope, tabs: new DocumentTabsBo(scope.document, tabs, this.deps.tabLimit) };
  }
  private async replay(
    scope: TabsScope,
    receipt: DocumentReceiptDto,
  ): Promise<Applied<DocumentWriteResponseDto>> {
    const document = await this.steps.view(scope.daos, scope.access, scope.row);
    return { value: { document, receipt }, changed: false };
  }
  /** Every image of the body must already be associated with a tab the requester sees (prepared
   *  here, or copied from another tab); the tab then shows exactly those. */
  private async confirmAssets(
    scope: TabsScope,
    tabId: string,
    content: DocumentContentDto,
  ): Promise<void> {
    const { campaignId, id: documentId } = scope.row;
    const visible = new Set(scope.tabs.visibleTo().map((tab) => tab.id));
    const known = (await scope.daos.assets.ofDocument(campaignId, documentId))
      .filter((reference) => visible.has(reference.tabId))
      .map((reference) => reference.assetId);
    const assetIds = documentAssetIds(content);
    const unknown = assetIds.find((assetId) => !known.includes(assetId));
    if (unknown)
      throw new DocumentError(
        'DOCUMENT_ASSET_NOT_FOUND',
        `Asset ${unknown} must be associated with a visible tab of document ${documentId} in ${campaignId}`,
      );
    await scope.daos.assets.confirmTab(campaignId, documentId, tabId, assetIds);
  }
}
function receiptOf(
  actionId: string,
  documentId: string,
  version: number,
  operation: TabOperation,
  tabId: string | undefined,
): DocumentReceiptDto {
  return { actionId, documentId, version, operation, ...(tabId ? { tabId } : {}) };
}
