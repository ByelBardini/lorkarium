import type { AssetReadPolicyPort } from '../assets/asset-read-policy.port';
import type { DocumentRow, DocumentsDao } from './documents.dao';
import type { DocumentTabsDao } from './document-tabs.dao';
import type { DocumentAssetsDao } from './document-assets.dao';
import type { DocumentAssetPo } from './document-assets.po';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { viewerAccessOf } from '../campaigns/member-access';
import { DocumentAccessBo } from './document-access.bo';
import { visibleTabsOf } from './document-tabs.bo';

export type DocumentAssetReadDaos = Readonly<{
  documents: Pick<DocumentsDao, 'withAsset' | 'owners'>;
  tabs: Pick<DocumentTabsDao, 'listOfDocument'>;
  assets: Pick<DocumentAssetsDao, 'ofAsset'>;
  members: Pick<CampaignMembersDao, 'findMembership'>;
}>;
export type DocumentAssetReadSnapshot = <T>(
  work: (daos: DocumentAssetReadDaos) => Promise<T>,
) => Promise<T>;
/** A document image is readable through any tab the reader sees: confirmed in its saved body,
 *  or only prepared when the reader also edits the document. The library cover of a document is
 *  readable by whoever reads that document, whatever tab it came from.
 *
 *  Example: `await policy.canRead(biaId, vharnId, assetId) // false when only in "Segredos"` */
export class DocumentAssetReadPolicy implements AssetReadPolicyPort {
  constructor(private readonly snapshot: DocumentAssetReadSnapshot) {}
  async canRead(userId: string, campaignId: string, assetId: string): Promise<boolean> {
    return this.snapshot(async (daos) => {
      const access = await viewerAccessOf(daos.members, campaignId, userId);
      const documents = await daos.documents.withAsset(campaignId, assetId);
      if (!documents.length) return false;
      const references = await daos.assets.ofAsset(campaignId, assetId);
      for (const row of documents)
        if (await this.readableIn(daos, access, row, assetId, references)) return true;
      return false;
    });
  }
  private async readableIn(
    daos: DocumentAssetReadDaos,
    access: CampaignAccessBo,
    row: DocumentRow,
    assetId: string,
    references: readonly DocumentAssetPo[],
  ): Promise<boolean> {
    const owners = await daos.documents.owners(row.campaignId, row.id);
    const document = new DocumentAccessBo(access, { ...row, ownerIds: owners });
    if (!document.canRead()) return false;
    if (row.previewAssetId === assetId) return true;
    const tabs = await daos.tabs.listOfDocument(row.campaignId, row.id);
    const visible = new Set(visibleTabsOf(document, tabs).map((tab) => tab.id));
    // A tab id belongs to one document: the visible set already keeps the other documents out.
    return references.some(
      (reference) => visible.has(reference.tabId) && (reference.inContent || document.canEdit()),
    );
  }
}
