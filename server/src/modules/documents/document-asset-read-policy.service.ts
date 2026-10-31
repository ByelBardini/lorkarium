import type { AssetReadPolicyPort } from '../assets/asset-read-policy.port';
import type { DocumentsDao } from './documents.dao';
import type { DocumentTabsDao } from './document-tabs.dao';
import type { DocumentAssetsDao } from './document-assets.dao';
import type { DocumentAssetPo } from './document-assets.po';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { viewerAccessOf } from '../campaigns/member-access';
import { DocumentAccessBo } from './document-access.bo';
import { visibleTabsOf } from './document-tabs.bo';

export type DocumentAssetReadDaos = Readonly<{
  documents: Pick<DocumentsDao, 'findInCampaign' | 'owners'>;
  tabs: Pick<DocumentTabsDao, 'listOfDocument'>;
  assets: Pick<DocumentAssetsDao, 'ofAsset'>;
  members: Pick<CampaignMembersDao, 'findMembership'>;
}>;
export type DocumentAssetReadSnapshot = <T>(
  work: (daos: DocumentAssetReadDaos) => Promise<T>,
) => Promise<T>;
/** A document image is readable through any tab the reader sees: confirmed in its saved body,
 *  or only prepared when the reader also edits the document.
 *
 *  Example: `await policy.canRead(biaId, vharnId, assetId) // false when only in "Segredos"` */
export class DocumentAssetReadPolicy implements AssetReadPolicyPort {
  constructor(private readonly snapshot: DocumentAssetReadSnapshot) {}
  async canRead(userId: string, campaignId: string, assetId: string): Promise<boolean> {
    return this.snapshot(async (daos) => {
      const access = await viewerAccessOf(daos.members, campaignId, userId);
      const references = await daos.assets.ofAsset(campaignId, assetId);
      for (const documentId of new Set(references.map((reference) => reference.documentId))) {
        const ofDocument = references.filter((reference) => reference.documentId === documentId);
        if (await this.readableIn(daos, access, documentId, ofDocument)) return true;
      }
      return false;
    });
  }
  private async readableIn(
    daos: DocumentAssetReadDaos,
    access: CampaignAccessBo,
    documentId: string,
    references: readonly DocumentAssetPo[],
  ): Promise<boolean> {
    const campaignId = access.campaignIdOf();
    const row = await daos.documents.findInCampaign(campaignId, documentId);
    if (!row) return false;
    const owners = await daos.documents.owners(campaignId, documentId);
    const document = new DocumentAccessBo(access, { ...row, ownerIds: owners });
    if (!document.canRead()) return false;
    const tabs = await daos.tabs.listOfDocument(campaignId, documentId);
    const visible = new Set(visibleTabsOf(document, tabs).map((tab) => tab.id));
    return references.some(
      (reference) => visible.has(reference.tabId) && (reference.inContent || document.canEdit()),
    );
  }
}
