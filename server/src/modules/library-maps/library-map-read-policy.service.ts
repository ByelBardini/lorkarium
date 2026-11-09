import type { AssetReadPolicyPort } from '../assets/asset-read-policy.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { viewerAccessOf } from '../campaigns/member-access';
import { LibraryMapAccessBo } from './library-map-access.bo';
import type { LibraryMapsDao } from './library-maps.dao';

export type LibraryMapReadDaos = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  maps: Pick<LibraryMapsDao, 'findByAsset'>;
}>;

export type LibraryMapReadTransaction = <T>(
  work: (daos: LibraryMapReadDaos) => Promise<T>,
) => Promise<T>;

/** Who reads the bytes of a map image: whoever can see the map that uses it.
 *
 *  Example: `await new LibraryMapReadPolicy(snapshot).canRead(user.id, campaignId, assetId)` */
export class LibraryMapReadPolicy implements AssetReadPolicyPort {
  constructor(private readonly snapshot: LibraryMapReadTransaction) {}

  async canRead(userId: string, campaignId: string, assetId: string): Promise<boolean> {
    return this.snapshot(async (daos) => {
      const access = await viewerAccessOf(daos.members, campaignId, userId);
      const map = await daos.maps.findByAsset(campaignId, assetId);
      // Between the upload and the creation of the map the file is still the master's alone.
      if (map === undefined) return access.isMaster();
      return new LibraryMapAccessBo(access).canSee(map);
    });
  }
}
