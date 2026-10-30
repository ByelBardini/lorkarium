import type { AssetDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  DocumentImagesService,
  type DocumentImagesDeps,
} from '../../../src/modules/documents/document-images.service';
import { ACTION_ID, DOCUMENT_ID } from '../../support/documents-fakes';
import { VHARN_ID } from '../../support/campaigns-factories';
import { ANA_ID } from '../../support/auth-factories';

type DocumentAuthorization = DocumentImagesDeps['documents'];
type DocumentIngest = DocumentImagesDeps['assets'];
class DocumentEditorAuthorizationFake implements DocumentAuthorization {
  denied = false;
  revoked = false;
  constructor(readonly journal: string[]) {}
  async authorizeEditor(): Promise<void> {
    if (this.denied) throw new Error('not an editor');
    this.journal.push('authorize');
  }
  async associateAsset(): Promise<void> {
    this.journal.push('revalidate');
    if (this.revoked) throw new Error('editor revoked');
    this.journal.push('associate');
  }
  async associateLibraryAsset(): Promise<AssetDto> {
    await this.authorizeEditor();
    await this.associateAsset();
    return { id: ACTION_ID, width: 80, height: 40, mimeType: 'image/png' };
  }
}
class DocumentImageIngestFake implements DocumentIngest {
  constructor(readonly journal: string[]) {}
  async uploadDocumentImage(): Promise<AssetDto> {
    this.journal.push('upload');
    return { id: ACTION_ID, width: 80, height: 40, mimeType: 'image/png' };
  }
  async importDocumentImage(): Promise<AssetDto> {
    this.journal.push('fetch');
    return { id: ACTION_ID, width: 80, height: 40, mimeType: 'image/png' };
  }
}
function imageHarness() {
  const journal: string[] = [];
  const documents = new DocumentEditorAuthorizationFake(journal);
  return {
    journal,
    documents,
    service: new DocumentImagesService({ documents, assets: new DocumentImageIngestFake(journal) }),
  };
}
const requester = { campaignId: VHARN_ID, userId: ANA_ID };
describe('DocumentImagesService', () => {
  it('non editor cannot trigger URL fetching or association', async () => {
    const harness = imageHarness();
    harness.documents.denied = true;
    await expect(
      harness.service.importLink(requester, DOCUMENT_ID, 'https://example.com/map.png'),
    ).rejects.toThrow('not an editor');
    expect(harness.journal).toEqual([]);
  });
  it('uploaded image is returned only after association revalidates current editor access', async () => {
    const harness = imageHarness();
    const asset = await harness.service.upload(requester, DOCUMENT_ID, new Uint8Array([1, 2]));
    expect(asset).toEqual({ id: ACTION_ID, width: 80, height: 40, mimeType: 'image/png' });
    expect(harness.journal).toEqual(['authorize', 'upload', 'revalidate', 'associate']);
  });
  it('editor revoked during import receives no successful preparation', async () => {
    const harness = imageHarness();
    harness.documents.revoked = true;
    await expect(
      harness.service.importLink(requester, DOCUMENT_ID, 'https://example.com/map.png'),
    ).rejects.toThrow('editor revoked');
    expect(harness.journal).toEqual(['authorize', 'fetch', 'revalidate']);
  });
});
