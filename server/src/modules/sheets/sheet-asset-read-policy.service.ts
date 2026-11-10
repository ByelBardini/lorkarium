import type { AssetReadPolicyPort } from '../assets/asset-read-policy.port';
import { viewerAccessOf } from '../campaigns/member-access';
import { sheetRulesOf, type SheetImageWork, type SheetImagesDeps } from './sheet-images.service';

/** A sheet image is readable by who reads any sheet it was sent to; an image tied to no sheet
 *  (its sheet deleted, or the tie never saved) is read by nobody, the master included.
 *
 *  Example: `await policy.canRead(caioId, vharnId, assetId) // true only on a table sheet he sees` */
export class SheetAssetReadPolicy implements AssetReadPolicyPort {
  constructor(
    private readonly snapshot: SheetImageWork,
    private readonly holders: SheetImagesDeps['holders'],
  ) {}

  async canRead(userId: string, campaignId: string, assetId: string): Promise<boolean> {
    return this.snapshot(async (daos) => {
      const access = await viewerAccessOf(daos.members, campaignId, userId);
      for (const sheetId of await daos.sheetAssets.sheetsOfAsset(campaignId, assetId)) {
        const rules = await sheetRulesOf(daos, this.holders, access, sheetId);
        if (rules?.canRead()) return true;
      }
      return false;
    });
  }
}
