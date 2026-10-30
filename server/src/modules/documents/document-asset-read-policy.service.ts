import type { AssetReadPolicyPort } from '../assets/asset-read-policy.port';
import type { DocumentsDao } from './documents.dao';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { viewerAccessOf } from '../campaigns/member-access';
import { DocumentAccessBo } from './document-access.bo';

export type DocumentAssetReadDaos = Readonly<{
  documents: Pick<DocumentsDao, 'documentsForAsset' | 'findInCampaign' | 'owners'>;
  members: Pick<CampaignMembersDao, 'findMembership'>;
}>;
export type DocumentAssetReadSnapshot = <T>(
  work: (daos: DocumentAssetReadDaos) => Promise<T>,
) => Promise<T>;
export class DocumentAssetReadPolicy implements AssetReadPolicyPort {
  constructor(private readonly snapshot: DocumentAssetReadSnapshot) {}
  async canRead(userId: string, campaignId: string, assetId: string): Promise<boolean> {
    return this.snapshot(async (daos) => {
      const access = await viewerAccessOf(daos.members, campaignId, userId);
      const references = await daos.documents.documentsForAsset(campaignId, assetId);
      for (const reference of references) {
        const row = await daos.documents.findInCampaign(campaignId, reference.documentId);
        if (!row) continue;
        const owners = await daos.documents.owners(campaignId, row.id);
        const permission = new DocumentAccessBo(access, { ...row, ownerIds: owners });
        if (permission.canEdit() || (reference.inContent && permission.canRead())) return true;
      }
      return false;
    });
  }
}
