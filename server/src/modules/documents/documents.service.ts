import {
  EMPTY_DOCUMENT_CONTENT,
  UNNAMED_DOCUMENT_NAME,
  type AssetDto,
  type CreateDocumentRequestDto,
  type DeleteDocumentRequestDto,
  type DocumentDto,
  type DocumentReceiptDto,
  type DocumentWriteResponseDto,
  type UpdateDocumentContentRequestDto,
  type UpdateDocumentRequestDto,
} from '@lorkarium/contracts';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { viewerAccessOf } from '../campaigns/member-access';
import { FolderNotFoundError } from '../library/library.error';
import type { LibraryRequester } from '../library/library.service';
import { LibraryImageNotFoundError } from '../library/library-image.error';
import { toAssetDto } from '../assets/assets.mapper';
import type { DocumentPo } from './documents.po';
import { DocumentTabsBo, FIRST_DOCUMENT_TAB_NAME } from './document-tabs.bo';
import {
  DocumentWriteSteps,
  commandFingerprint,
  type Applied,
  type DocumentDaos,
  type DocumentScope,
  type DocumentsServiceDeps,
} from './document-writes.service';

type WriteInput = UpdateDocumentRequestDto | UpdateDocumentContentRequestDto;
type WriteKind = Readonly<{ operation: 'content' | 'update'; manage: boolean }>;

/** The document itself: create (with its "Geral" tab), read, rename, administer, delete, and the
 *  image associations of a tab the requester edits.
 *
 *  Example: `await service.create(requester, { actionId })` */
export class DocumentsService {
  private readonly steps: DocumentWriteSteps;
  constructor(private readonly deps: DocumentsServiceDeps) {
    this.steps = new DocumentWriteSteps(deps);
  }
  async get(requester: LibraryRequester, documentId: string): Promise<DocumentDto> {
    return this.deps.snapshot(async (daos) => {
      const access = await viewerAccessOf(daos.members, requester.campaignId, requester.userId);
      const { row } = await this.steps.scopeOf(daos, access, documentId);
      return this.steps.view(daos, access, row);
    });
  }
  async create(
    requester: LibraryRequester,
    input: CreateDocumentRequestDto,
  ): Promise<DocumentWriteResponseDto> {
    const result = await this.deps.transaction(async (daos) => {
      const access = await this.steps.lockedAccess(daos, requester);
      access.requireMaster('create a document');
      const fingerprint = commandFingerprint('create', null, input);
      const previous = await this.steps.previous(daos, requester, input.actionId, fingerprint);
      if (previous) return this.replay(daos, access, previous);
      await this.requireFolder(daos, requester.campaignId, input.folderId ?? null);
      const row = await this.insertWithFirstTab(daos, requester, input);
      const receipt = receiptOf(input.actionId, row, 'create');
      await this.steps.record(daos, requester, receipt, fingerprint);
      return {
        value: { document: await this.steps.view(daos, access, row), receipt },
        changed: true,
      };
    });
    return this.steps.published(requester.campaignId, result);
  }
  /** Renames the document (master or owner); the body moved to the tabs. */
  async updateContent(
    requester: LibraryRequester,
    documentId: string,
    input: UpdateDocumentContentRequestDto,
  ): Promise<DocumentWriteResponseDto> {
    const kind = { operation: 'content', manage: false } as const;
    return this.write(requester, documentId, input, kind, ({ daos, row }) =>
      daos.documents.update(requester.campaignId, documentId, {
        name: input.name,
        version: row.version + 1,
        updatedAt: this.steps.now(),
      }),
    );
  }
  async update(
    requester: LibraryRequester,
    documentId: string,
    input: UpdateDocumentRequestDto,
  ): Promise<DocumentWriteResponseDto> {
    const kind = { operation: 'update', manage: true } as const;
    return this.write(requester, documentId, input, kind, async ({ daos, row }) => {
      if (input.folderId !== undefined)
        await this.requireFolder(daos, requester.campaignId, input.folderId);
      if (input.ownerIds) await this.setOwners(daos, requester, input.ownerIds, documentId);
      return daos.documents.update(requester.campaignId, documentId, {
        ...(input.folderId === undefined ? {} : { folderId: input.folderId }),
        ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
        version: row.version + 1,
        updatedAt: this.steps.now(),
      });
    });
  }
  async delete(
    requester: LibraryRequester,
    documentId: string,
    input: DeleteDocumentRequestDto,
  ): Promise<void> {
    const result = await this.deps.transaction(async (daos) => {
      const access = await this.steps.lockedAccess(daos, requester);
      access.requireMaster(`delete document ${documentId}`);
      const fingerprint = commandFingerprint('delete', documentId, input);
      if (await this.steps.previous(daos, requester, input.actionId, fingerprint))
        return { value: undefined, changed: false };
      const { row, document } = await this.steps.scopeOf(daos, access, documentId);
      document.requireManage();
      document.requireVersion(input.expectedVersion);
      await daos.documents.delete(requester.campaignId, documentId);
      await this.steps.record(
        daos,
        requester,
        receiptOf(input.actionId, row, 'delete'),
        fingerprint,
      );
      return { value: undefined, changed: true };
    });
    this.steps.published(requester.campaignId, result);
  }
  /** Refuses before any upload unless the requester edits a tab they can see. */
  async authorizeEditor(
    requester: LibraryRequester,
    documentId: string,
    tabId: string,
  ): Promise<void> {
    await this.deps.snapshot(async (daos) => {
      const access = await viewerAccessOf(daos.members, requester.campaignId, requester.userId);
      await this.editedTab(await this.steps.scopeOf(daos, access, documentId), tabId);
    });
  }
  async associateAsset(
    requester: LibraryRequester,
    documentId: string,
    tabId: string,
    assetId: string,
  ): Promise<void> {
    await this.deps.transaction(async (daos) => {
      const access = await this.steps.lockedAccess(daos, requester);
      await this.editedTab(await this.steps.scopeOf(daos, access, documentId), tabId);
      await daos.assets.prepare(requester.campaignId, documentId, tabId, assetId);
    });
  }
  async associateLibraryAsset(
    requester: LibraryRequester,
    documentId: string,
    tabId: string,
    imageId: string,
  ): Promise<AssetDto> {
    return this.deps.transaction(async (daos) => {
      const access = await this.steps.lockedAccess(daos, requester);
      await this.editedTab(await this.steps.scopeOf(daos, access, documentId), tabId);
      const row = await daos.images.findInCampaign(requester.campaignId, imageId);
      if (!row || (!access.isMaster() && row.image.visibility !== 'public'))
        throw new LibraryImageNotFoundError(requester.campaignId, imageId);
      await daos.assets.prepare(requester.campaignId, documentId, tabId, row.asset.id);
      return toAssetDto(row.asset);
    });
  }
  private async editedTab(scope: DocumentScope, tabId: string): Promise<void> {
    const tabs = await scope.daos.tabs.listOfDocument(scope.row.campaignId, scope.row.id);
    new DocumentTabsBo(scope.document, tabs, this.deps.tabLimit).requireEdit(tabId);
  }
  private async insertWithFirstTab(
    daos: DocumentDaos,
    requester: LibraryRequester,
    input: CreateDocumentRequestDto,
  ): Promise<DocumentPo> {
    const row = await daos.documents.insert({
      id: this.deps.newId(),
      campaignId: requester.campaignId,
      folderId: input.folderId ?? null,
      name: input.name ?? UNNAMED_DOCUMENT_NAME,
      visibility: 'private',
      createdBy: requester.userId,
    });
    await daos.tabs.insert({
      id: this.deps.newId(),
      campaignId: requester.campaignId,
      documentId: row.id,
      name: FIRST_DOCUMENT_TAB_NAME,
      position: 0,
      content: EMPTY_DOCUMENT_CONTENT,
    });
    return row;
  }
  private async write(
    requester: LibraryRequester,
    documentId: string,
    input: WriteInput,
    kind: WriteKind,
    save: (scope: DocumentScope) => Promise<DocumentPo>,
  ): Promise<DocumentWriteResponseDto> {
    const result = await this.deps.transaction(async (daos) => {
      const access = await this.steps.lockedAccess(daos, requester);
      const scope = await this.steps.scopeOf(daos, access, documentId);
      if (kind.manage) scope.document.requireManage();
      else scope.document.requireEdit();
      const fingerprint = commandFingerprint(kind.operation, documentId, input);
      const previous = await this.steps.previous(daos, requester, input.actionId, fingerprint);
      if (previous) return this.replay(daos, access, previous);
      scope.document.requireVersion(input.expectedVersion);
      const row = await save(scope);
      const receipt = receiptOf(input.actionId, row, kind.operation);
      await this.steps.record(daos, requester, receipt, fingerprint);
      return {
        value: { document: await this.steps.view(daos, access, row), receipt },
        changed: true,
      };
    });
    return this.steps.published(requester.campaignId, result);
  }
  /** An action already applied: reauthorized and answered with the current document. */
  private async replay(
    daos: DocumentDaos,
    access: CampaignAccessBo,
    receipt: DocumentReceiptDto,
  ): Promise<Applied<DocumentWriteResponseDto>> {
    const { row } = await this.steps.scopeOf(daos, access, receipt.documentId);
    return {
      value: { document: await this.steps.view(daos, access, row), receipt },
      changed: false,
    };
  }
  private async requireFolder(
    daos: DocumentDaos,
    campaignId: string,
    folderId: string | null,
  ): Promise<void> {
    if (!folderId) return;
    const folders = await daos.folders.listOfCampaign(campaignId);
    if (!folders.some((folder) => folder.id === folderId))
      throw new FolderNotFoundError(campaignId, folderId);
  }
  private async setOwners(
    daos: DocumentDaos,
    requester: LibraryRequester,
    ownerIds: string[],
    documentId: string,
  ): Promise<void> {
    for (const userId of ownerIds) {
      const member = await daos.members.findMembership(requester.campaignId, userId, true);
      if (member?.role === 'player') continue;
      const access = await viewerAccessOf(daos.members, requester.campaignId, requester.userId);
      access.forbid(
        `assign owner ${userId} to document ${documentId}`,
        'current players of the same campaign',
      );
    }
    await daos.documents.replaceOwners(requester.campaignId, documentId, ownerIds);
  }
}
function receiptOf(
  actionId: string,
  row: DocumentPo,
  operation: DocumentReceiptDto['operation'],
): DocumentReceiptDto {
  return { actionId, documentId: row.id, version: row.version, operation };
}
