import type { AssetReadPolicyPort } from '../assets/asset-read-policy.port';
import { viewerAccessOf } from '../campaigns/member-access';
import { readsAnySheet, type SheetImageWork } from './sheet-images.service';

/** A sheet image is readable by who reads any sheet it was sent to; an image tied to no sheet
 *  (its sheet deleted, or the tie never saved) is read by nobody, the master included. The same
 *  queries however many sheets use it.
 *
 *  Example: `await policy.canRead(caioId, vharnId, assetId) // true only on a table sheet he sees` */
export class SheetAssetReadPolicy implements AssetReadPolicyPort {
  constructor(private readonly snapshot: SheetImageWork) {}

  async canRead(userId: string, campaignId: string, assetId: string): Promise<boolean> {
    return this.snapshot(async (daos) => {
      const access = await viewerAccessOf(daos.members, campaignId, userId);
      const sheetIds = await daos.sheetAssets.sheetsOfAsset(campaignId, assetId);
      return readsAnySheet(daos, access, sheetIds);
    });
  }
}
