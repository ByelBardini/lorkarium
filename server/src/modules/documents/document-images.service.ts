import type { AssetDto } from '@lorkarium/contracts';
import type { AssetsService } from '../assets/assets.service';
import type { LibraryRequester } from '../library/library.service';
import type { DocumentsService } from './documents.service';

export type DocumentImagesDeps = Readonly<{
  documents: Pick<DocumentsService, 'authorizeEditor' | 'associateAsset' | 'associateLibraryAsset'>;
  assets: Pick<AssetsService, 'uploadDocumentImage' | 'importDocumentImage'>;
}>;
export class DocumentImagesService {
  constructor(private readonly deps: DocumentImagesDeps) {}
  async upload(
    requester: LibraryRequester,
    documentId: string,
    bytes: Uint8Array,
  ): Promise<AssetDto> {
    await this.deps.documents.authorizeEditor(requester, documentId);
    const asset = await this.deps.assets.uploadDocumentImage(
      requester.userId,
      requester.campaignId,
      bytes,
    );
    await this.deps.documents.associateAsset(requester, documentId, asset.id);
    return asset;
  }
  async importLink(
    requester: LibraryRequester,
    documentId: string,
    url: string,
  ): Promise<AssetDto> {
    await this.deps.documents.authorizeEditor(requester, documentId);
    const asset = await this.deps.assets.importDocumentImage(
      requester.userId,
      requester.campaignId,
      url,
    );
    await this.deps.documents.associateAsset(requester, documentId, asset.id);
    return asset;
  }
  async fromLibrary(
    requester: LibraryRequester,
    documentId: string,
    imageId: string,
  ): Promise<AssetDto> {
    return this.deps.documents.associateLibraryAsset(requester, documentId, imageId);
  }
}
