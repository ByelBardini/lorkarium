import { createHash } from 'node:crypto';
import {
  documentReceiptDto,
  type DocumentContentDto,
  type DocumentDto,
  type DocumentReceiptDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import type { CampaignsDao } from '../campaigns/campaigns.dao';
import { toCampaignAccessBo } from '../campaigns/campaigns.mapper';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { CampaignNotFoundError } from '../campaigns/campaigns.error';
import { viewerAccessOf } from '../campaigns/member-access';
import type { SceneFoldersDao } from '../library/scene-folders.dao';
import type { LibraryImagesDao } from '../library/library-images.dao';
import type { LibraryPublisherPort } from '../library/library-publisher.port';
import type { LibraryRequester } from '../library/library.service';
import type { DocumentsDao } from './documents.dao';
import type { DocumentTabsDao } from './document-tabs.dao';
import type { DocumentAssetsDao } from './document-assets.dao';
import type { DocumentPo } from './documents.po';
import { DocumentAccessBo } from './document-access.bo';
import { DocumentError, DocumentNotFoundError } from './documents.error';
import { toDocumentDto } from './documents.mapper';

export type DocumentDaos = Readonly<{
  documents: Pick<
    DocumentsDao,
    | 'findInCampaign'
    | 'insert'
    | 'update'
    | 'delete'
    | 'owners'
    | 'replaceOwners'
    | 'action'
    | 'recordAction'
  >;
  tabs: Pick<
    DocumentTabsDao,
    'listOfDocument' | 'findInDocument' | 'insert' | 'update' | 'saveContent' | 'reorder' | 'delete'
  >;
  assets: Pick<DocumentAssetsDao, 'ofDocument' | 'ofAsset' | 'prepare' | 'confirmTab'>;
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
  /** At most this many tabs per document (`DOCUMENT_TABS_MAX`, given by the plugin). */
  tabLimit: number;
}>;
/** One document loaded for a command: the row, its owners and what the requester may do. */
export type DocumentScope = Readonly<{
  daos: DocumentDaos;
  access: CampaignAccessBo;
  row: DocumentPo;
  owners: string[];
  document: DocumentAccessBo;
}>;
/** What a transaction answers, and whether it applied something to publish after the commit. */
export type Applied<T> = Readonly<{ value: T; changed: boolean }>;

/** The steps every document and tab command shares: lock, scope, receipts, view and publish.
 *
 *  Example: `const access = await steps.lockedAccess(daos, requester)` */
export class DocumentWriteSteps {
  constructor(private readonly deps: Pick<DocumentsServiceDeps, 'clock' | 'publisher'>) {}
  async lockedAccess(daos: DocumentDaos, requester: LibraryRequester): Promise<CampaignAccessBo> {
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
  /** The document as the requester may read it; private and foreign ones are DOCUMENT_NOT_FOUND. */
  async scopeOf(
    daos: DocumentDaos,
    access: CampaignAccessBo,
    documentId: string,
  ): Promise<DocumentScope> {
    const campaignId = access.campaignIdOf();
    const row = await daos.documents.findInCampaign(campaignId, documentId);
    if (!row) throw new DocumentNotFoundError(campaignId, documentId);
    const owners = await daos.documents.owners(campaignId, documentId);
    const document = new DocumentAccessBo(access, { ...row, ownerIds: owners });
    document.requireRead();
    return { daos, access, row, owners, document };
  }
  /** The document with its current owners and the tab summaries its reader sees. */
  async view(daos: DocumentDaos, access: CampaignAccessBo, row: DocumentPo): Promise<DocumentDto> {
    const owners = await daos.documents.owners(row.campaignId, row.id);
    const tabs = await daos.tabs.listOfDocument(row.campaignId, row.id);
    return toDocumentDto(row, owners, access, tabs);
  }
  /** The receipt of an action already applied with the same command, or null for a new one. */
  async previous(
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
  async record(
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
  /** A structural tab change is a change of the document: its version goes up by one. */
  async bumpDocument(scope: DocumentScope): Promise<DocumentPo> {
    return scope.daos.documents.update(scope.row.campaignId, scope.row.id, {
      version: scope.row.version + 1,
      updatedAt: this.deps.clock.now(),
    });
  }
  now(): Date {
    return this.deps.clock.now();
  }
  /** Publishes `library:changed` only for an applied command, after its commit. */
  published<T>(campaignId: string, result: Applied<T>): T {
    if (result.changed)
      this.deps.publisher.libraryChanged({ campaignId, at: this.deps.clock.now().toISOString() });
    return result.value;
  }
}
/** The image asset ids a tab body shows, found without recursion.
 *
 *  Example: `documentAssetIds(content) // ['5b0c…']` */
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
/** SHA-256 of the canonical command, so a replayed actionId is told apart from a reused one.
 *
 *  Example: `commandFingerprint('tab-create', documentId, input)` */
export function commandFingerprint(
  operation: string,
  targetId: string | null,
  input: unknown,
): string {
  return createHash('sha256')
    .update(JSON.stringify([operation, targetId, canonicalValue(input)]))
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
