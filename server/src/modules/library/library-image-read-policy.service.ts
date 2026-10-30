import type { AssetReadPolicyPort } from '../assets/asset-read-policy.port';
import { viewerAccessOf } from '../campaigns/member-access';
import { canReadLibraryImage } from './library-image.bo';
import type { LibraryImageDaos } from './library-image.service';
export type LibraryImageReadDaos = Readonly<{
  members: LibraryImageDaos['members'];
  images: Pick<LibraryImageDaos['images'], 'listOfCampaign'>;
  presentations: Pick<LibraryImageDaos['presentations'], 'findOfCampaign'>;
}>;
export type LibraryImageReadTransaction = <T>(
  work: (daos: LibraryImageReadDaos) => Promise<T>,
) => Promise<T>;
export class LibraryImageReadPolicy implements AssetReadPolicyPort {
  constructor(private readonly snapshot: LibraryImageReadTransaction) {}
  async canRead(userId: string, campaignId: string, assetId: string): Promise<boolean> {
    return this.snapshot(async (daos) => {
      const access = await viewerAccessOf(daos.members, campaignId, userId);
      if (access.isMaster()) return true;
      const images = await daos.images.listOfCampaign(campaignId);
      const image = images.find((row) => row.asset.id === assetId);
      const presentation = await daos.presentations.findOfCampaign(campaignId);
      return canReadLibraryImage(
        false,
        image?.image.visibility ?? null,
        !!image && presentation?.imageId === image.image.id,
      );
    });
  }
}
