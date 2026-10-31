import type { AssetDto } from '@lorkarium/contracts';
import type { AssetsService } from '../assets/assets.service';
import type { LibraryRequester } from '../library/library.service';
import type { DocumentsService } from './documents.service';

/** The tab an image is prepared for: it is readable only to those who see that tab. */
export type DocumentTabTarget = Readonly<{ documentId: string; tabId: string }>;
export type DocumentImagesDeps = Readonly<{
  documents: Pick<DocumentsService, 'authorizeEditor' | 'associateAsset' | 'associateLibraryAsset'>;
  assets: Pick<AssetsService, 'uploadDocumentImage' | 'importDocumentImage'>;
}>;
/** Images of a tab: authorize before any S3/fetch, then associate in a transaction that
 *  authorizes again (no I/O under the lock).
 *
 *  Example: `await images.upload(requester, { documentId, tabId }, bytes)` */
export class DocumentImagesService {
  constructor(private readonly deps: DocumentImagesDeps) {}
  async upload(
    requester: LibraryRequester,
    target: DocumentTabTarget,
    bytes: Uint8Array,
  ): Promise<AssetDto> {
    await this.deps.documents.authorizeEditor(requester, target.documentId, target.tabId);
    const asset = await this.deps.assets.uploadDocumentImage(
      requester.userId,
      requester.campaignId,
      bytes,
    );
    await this.deps.documents.associateAsset(requester, target.documentId, target.tabId, asset.id);
    return asset;
  }
  async importLink(
    requester: LibraryRequester,
    target: DocumentTabTarget,
    url: string,
  ): Promise<AssetDto> {
    await this.deps.documents.authorizeEditor(requester, target.documentId, target.tabId);
    const asset = await this.deps.assets.importDocumentImage(
      requester.userId,
      requester.campaignId,
      url,
    );
    await this.deps.documents.associateAsset(requester, target.documentId, target.tabId, asset.id);
    return asset;
  }
  async fromLibrary(
    requester: LibraryRequester,
    target: DocumentTabTarget,
    imageId: string,
  ): Promise<AssetDto> {
    return this.deps.documents.associateLibraryAsset(
      requester,
      target.documentId,
      target.tabId,
      imageId,
    );
  }
}
