import { createHash } from 'node:crypto';
import {
  EMPTY_DOCUMENT_CONTENT,
  UNNAMED_DOCUMENT_NAME,
  documentReceiptDto,
  type CreateDocumentRequestDto,
  type DeleteDocumentRequestDto,
  type DocumentContentDto,
  type DocumentDto,
  type DocumentReceiptDto,
  type DocumentWriteResponseDto,
  type UpdateDocumentContentRequestDto,
  type UpdateDocumentRequestDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import type { CampaignsDao } from '../campaigns/campaigns.dao';
import { toCampaignAccessBo } from '../campaigns/campaigns.mapper';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { CampaignNotFoundError } from '../campaigns/campaigns.error';
import { viewerAccessOf } from '../campaigns/member-access';
import type { SceneFoldersDao } from '../library/scene-folders.dao';
import { FolderNotFoundError } from '../library/library.error';
import type { LibraryPublisherPort } from '../library/library-publisher.port';
import type { LibraryRequester } from '../library/library.service';
import type { DocumentsDao } from './documents.dao';
import type { DocumentPo } from './documents.po';
import { DocumentAccessBo } from './document-access.bo';
import { DocumentError, DocumentNotFoundError } from './documents.error';
import { toDocumentDto } from './documents.mapper';
import type { LibraryImagesDao } from '../library/library-images.dao';
import { LibraryImageNotFoundError } from '../library/library-image.error';
import { toAssetDto } from '../assets/assets.mapper';
import type { AssetDto } from '@lorkarium/contracts';

export type DocumentDaos = Readonly<{
  documents: Pick<
    DocumentsDao,
    | 'findInCampaign'
    | 'insert'
    | 'update'
    | 'delete'
    | 'owners'
    | 'replaceOwners'
    | 'references'
    | 'confirmAssets'
    | 'action'
    | 'recordAction'
    | 'associateAsset'
    | 'documentsForAsset'
  >;
  campaigns: Pick<CampaignsDao, 'lockById'>;
  members: Pick<CampaignMembersDao, 'findMembership'>;
  folders: Pick<SceneFoldersDao, 'listOfCampaign'>;
  images: Pick<LibraryImagesDao, 'findInCampaign'>;
}>;
export type DocumentTransaction = <T>(work: (daos: DocumentDaos) => Promise<T>) => Promise<T>;
export type DocumentsServiceDeps = Readonly<{
  read: DocumentDaos;
  transaction: DocumentTransaction;
  snapshot: DocumentTransaction;
  clock: ClockPort;
  newId: () => string;
  publisher: Pick<LibraryPublisherPort, 'libraryChanged'>;
}>;
type WriteInput =
  UpdateDocumentRequestDto | UpdateDocumentContentRequestDto | DeleteDocumentRequestDto;
type WriteScope = Readonly<{
  daos: DocumentDaos;
  access: CampaignAccessBo;
  row: DocumentPo;
  owners: string[];
}>;
export class DocumentsService {
  constructor(private readonly deps: DocumentsServiceDeps) {}
  async get(requester: LibraryRequester, documentId: string): Promise<DocumentDto> {
    return this.deps.snapshot(async (daos) => {
      const access = await viewerAccessOf(daos.members, requester.campaignId, requester.userId);
      const row = await this.rowOf(daos, requester.campaignId, documentId);
      const owners = await daos.documents.owners(requester.campaignId, documentId);
      new DocumentAccessBo(access, { ...row, ownerIds: owners }).requireRead();
      return toDocumentDto(row, owners, access);
    });
  }
  async create(
    requester: LibraryRequester,
    input: CreateDocumentRequestDto,
  ): Promise<DocumentWriteResponseDto> {
    const result = await this.deps.transaction(async (daos) => {
      const access = await this.lockedAccess(daos, requester);
      access.requireMaster('create a document');
      const fingerprint = commandFingerprint('create', null, input);
      const previous = await this.previous(daos, requester, input.actionId, fingerprint);
      if (previous)
        return { value: await this.replay(daos, requester, previous, access), changed: false };
      await this.requireFolder(daos, requester.campaignId, input.folderId ?? null);
      const row = await daos.documents.insert({
        id: this.deps.newId(),
        campaignId: requester.campaignId,
        folderId: input.folderId ?? null,
        name: input.name ?? UNNAMED_DOCUMENT_NAME,
        content: EMPTY_DOCUMENT_CONTENT,
        visibility: 'private',
        createdBy: requester.userId,
      });
      const receipt = this.receipt(input.actionId, row, 'create');
      await this.record(daos, requester, receipt, fingerprint);
      return { value: { document: toDocumentDto(row, [], access), receipt }, changed: true };
    });
    if (result.changed) this.publish(requester.campaignId);
    return result.value;
  }
  async updateContent(
    requester: LibraryRequester,
    documentId: string,
    input: UpdateDocumentContentRequestDto,
  ): Promise<DocumentWriteResponseDto> {
    return this.write(requester, documentId, input, 'content', async ({ daos, row }) => {
      if (input.content)
        await this.confirmContentAssets(daos, requester.campaignId, documentId, input.content);
      return daos.documents.update(requester.campaignId, documentId, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.content === undefined ? {} : { content: input.content }),
        version: row.version + 1,
        updatedAt: this.deps.clock.now(),
      });
    });
  }
  async update(
    requester: LibraryRequester,
    documentId: string,
    input: UpdateDocumentRequestDto,
  ): Promise<DocumentWriteResponseDto> {
    return this.write(requester, documentId, input, 'update', async ({ daos, row }) => {
      if (input.folderId !== undefined)
        await this.requireFolder(daos, requester.campaignId, input.folderId);
      if (input.ownerIds) await this.setOwners(daos, requester, input.ownerIds, documentId);
      return daos.documents.update(requester.campaignId, documentId, {
        ...(input.folderId === undefined ? {} : { folderId: input.folderId }),
        ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
        version: row.version + 1,
        updatedAt: this.deps.clock.now(),
      });
    });
  }
  async delete(
    requester: LibraryRequester,
    documentId: string,
    input: DeleteDocumentRequestDto,
  ): Promise<void> {
    const changed = await this.deps.transaction(async (daos) => {
      const access = await this.lockedAccess(daos, requester);
      access.requireMaster(`delete document ${documentId}`);
      const fingerprint = commandFingerprint('delete', documentId, input);
      if (await this.previous(daos, requester, input.actionId, fingerprint)) return false;
      const { row } = await this.authorized(daos, requester, documentId, access, true);
      new DocumentAccessBo(access, { ...row, ownerIds: [] }).requireVersion(input.expectedVersion);
      await daos.documents.delete(requester.campaignId, documentId);
      await this.record(daos, requester, this.receipt(input.actionId, row, 'delete'), fingerprint);
      return true;
    });
    if (changed) this.publish(requester.campaignId);
  }
  async authorizeEditor(requester: LibraryRequester, documentId: string): Promise<void> {
    const document = await this.get(requester, documentId);
    if (!document.canEdit) {
      const access = await viewerAccessOf(
        this.deps.read.members,
        requester.campaignId,
        requester.userId,
      );
      access.forbid(`edit document ${documentId}`, 'document ownership or master role');
    }
  }
  async associateAsset(
    requester: LibraryRequester,
    documentId: string,
    assetId: string,
  ): Promise<void> {
    await this.deps.transaction(async (daos) => {
      const access = await this.lockedAccess(daos, requester);
      await this.authorized(daos, requester, documentId, access, false);
      await daos.documents.associateAsset(requester.campaignId, documentId, assetId);
    });
  }
  async associateLibraryAsset(
    requester: LibraryRequester,
    documentId: string,
    imageId: string,
  ): Promise<AssetDto> {
    return this.deps.transaction(async (daos) => {
      const access = await this.lockedAccess(daos, requester);
      await this.authorized(daos, requester, documentId, access, false);
      const row = await daos.images.findInCampaign(requester.campaignId, imageId);
      if (!row || (!access.isMaster() && row.image.visibility !== 'public'))
        throw new LibraryImageNotFoundError(requester.campaignId, imageId);
      await daos.documents.associateAsset(requester.campaignId, documentId, row.asset.id);
      return toAssetDto(row.asset);
    });
  }
  private async write(
    requester: LibraryRequester,
    documentId: string,
    input: WriteInput,
    operation: 'content' | 'update',
    save: (scope: WriteScope) => Promise<DocumentPo>,
  ): Promise<DocumentWriteResponseDto> {
    const result = await this.deps.transaction(async (daos) => {
      const access = await this.lockedAccess(daos, requester);
      const scope = await this.authorized(
        daos,
        requester,
        documentId,
        access,
        operation === 'update',
      );
      const fingerprint = commandFingerprint(operation, documentId, input);
      const previous = await this.previous(daos, requester, input.actionId, fingerprint);
      if (previous)
        return { value: await this.replay(daos, requester, previous, access), changed: false };
      new DocumentAccessBo(access, { ...scope.row, ownerIds: scope.owners }).requireVersion(
        input.expectedVersion,
      );
      const row = await save(scope);
      const receipt = this.receipt(input.actionId, row, operation);
      await this.record(daos, requester, receipt, fingerprint);
      const owners = await daos.documents.owners(requester.campaignId, documentId);
      return { value: { document: toDocumentDto(row, owners, access), receipt }, changed: true };
    });
    if (result.changed) this.publish(requester.campaignId);
    return result.value;
  }
  private async authorized(
    daos: DocumentDaos,
    requester: LibraryRequester,
    documentId: string,
    access: CampaignAccessBo,
    manage: boolean,
  ): Promise<WriteScope> {
    const row = await this.rowOf(daos, requester.campaignId, documentId);
    const owners = await daos.documents.owners(requester.campaignId, documentId);
    const permissions = new DocumentAccessBo(access, { ...row, ownerIds: owners });
    if (manage) permissions.requireManage();
    else permissions.requireEdit();
    return { daos, access, row, owners };
  }
  private async lockedAccess(
    daos: DocumentDaos,
    requester: LibraryRequester,
  ): Promise<CampaignAccessBo> {
    await viewerAccessOf(daos.members, requester.campaignId, requester.userId);
    if (!(await daos.campaigns.lockById(requester.campaignId)))
      throw new CampaignNotFoundError(requester);
    const membership = await daos.members.findMembership(
      requester.campaignId,
      requester.userId,
      true,
    );
    const access = toCampaignAccessBo(requester.campaignId, requester.userId, membership);
    access.requireViewer();
    return access;
  }
  private async rowOf(
    daos: DocumentDaos,
    campaignId: string,
    documentId: string,
  ): Promise<DocumentPo> {
    const row = await daos.documents.findInCampaign(campaignId, documentId);
    if (!row) throw new DocumentNotFoundError(campaignId, documentId);
    return row;
  }
  private async requireFolder(
    daos: DocumentDaos,
    campaignId: string,
    folderId: string | null,
  ): Promise<void> {
    if (
      folderId &&
      !(await daos.folders.listOfCampaign(campaignId)).some((folder) => folder.id === folderId)
    )
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
      if (member?.role !== 'player') {
        const access = await viewerAccessOf(daos.members, requester.campaignId, requester.userId);
        access.forbid(
          `assign owner ${userId} to document ${documentId}`,
          'current players of the same campaign',
        );
      }
    }
    await daos.documents.replaceOwners(requester.campaignId, documentId, ownerIds);
  }
  private async confirmContentAssets(
    daos: DocumentDaos,
    campaignId: string,
    documentId: string,
    content: DocumentContentDto,
  ): Promise<void> {
    const assetIds = documentAssetIds(content);
    const references = await daos.documents.references(campaignId, documentId);
    for (const assetId of assetIds)
      if (!references.some((ref) => ref.assetId === assetId))
        throw new DocumentError(
          'DOCUMENT_ASSET_NOT_FOUND',
          `Asset ${assetId} must be associated with document ${documentId} in ${campaignId}`,
        );
    await daos.documents.confirmAssets(campaignId, documentId, assetIds);
  }
  private async previous(
    daos: DocumentDaos,
    requester: LibraryRequester,
    actionId: string,
    fingerprint: string,
  ): Promise<DocumentReceiptDto | null> {
    const previous = await daos.documents.action(requester.campaignId, requester.userId, actionId);
    if (!previous) return null;
    if (previous.fingerprint !== fingerprint)
      throw new DocumentError(
        'DOCUMENT_ACTION_REUSED',
        `Action ${actionId} already applied to a different document command`,
      );
    return documentReceiptDto.parse(previous.receipt);
  }
  private async replay(
    daos: DocumentDaos,
    requester: LibraryRequester,
    receipt: DocumentReceiptDto,
    access: CampaignAccessBo,
  ): Promise<DocumentWriteResponseDto> {
    const row = await this.rowOf(daos, requester.campaignId, receipt.documentId);
    const owners = await daos.documents.owners(requester.campaignId, row.id);
    new DocumentAccessBo(access, { ...row, ownerIds: owners }).requireRead();
    return { document: toDocumentDto(row, owners, access), receipt };
  }
  private receipt(
    actionId: string,
    row: DocumentPo,
    operation: DocumentReceiptDto['operation'],
  ): DocumentReceiptDto {
    return { actionId, documentId: row.id, version: row.version, operation };
  }
  private async record(
    daos: DocumentDaos,
    requester: LibraryRequester,
    receipt: DocumentReceiptDto,
    fingerprint: string,
  ): Promise<void> {
    await daos.documents.recordAction({
      campaignId: requester.campaignId,
      userId: requester.userId,
      actionId: receipt.actionId,
      operation: receipt.operation,
      fingerprint,
      receipt,
    });
  }
  private publish(campaignId: string): void {
    this.deps.publisher.libraryChanged({ campaignId, at: this.deps.clock.now().toISOString() });
  }
}
export function documentAssetIds(content: DocumentContentDto): string[] {
  const pending = [...content.content];
  const found = new Set<string>();
  while (pending.length) {
    const node = pending.pop();
    if (node?.type === 'image' && typeof node.attrs?.assetId === 'string')
      found.add(node.attrs.assetId);
    if (node?.content) pending.push(...node.content);
  }
  return [...found];
}
function commandFingerprint(operation: string, documentId: string | null, input: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify([operation, documentId, canonicalValue(input)]))
    .digest('hex');
}
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  return value;
}
