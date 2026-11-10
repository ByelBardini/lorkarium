import type { AssetReadPolicyPort } from '../assets/asset-read-policy.port';
import { viewerAccessOf } from '../campaigns/member-access';
import { sheetRulesOf, type SheetImageDaos, type SheetImagesDeps } from './sheet-images.service';
import type { SheetTemplatesDao } from './sheet-templates.dao';

/** What the read of a template asset reads, on one snapshot. */
export type SheetTemplateAssetReadDaos = SheetImageDaos &
  Readonly<{ templates: Pick<SheetTemplatesDao, 'sheetIdsUsingAsset'> }>;

export type SheetTemplateAssetReadWork = <T>(
  work: (daos: SheetTemplateAssetReadDaos) => Promise<T>,
) => Promise<T>;

/** A template asset is read by the masters of its table, and by whoever reads a sheet whose
 *  template's manifest declares it; nobody else, even after the template is gone.
 *
 *  Example: `await policy.canRead(caioId, vharnId, fontId) // true only on a sheet he reads` */
export class SheetTemplateAssetReadPolicy implements AssetReadPolicyPort {
  constructor(
    private readonly snapshot: SheetTemplateAssetReadWork,
    private readonly holders: SheetImagesDeps['holders'],
  ) {}

  async canRead(userId: string, campaignId: string, assetId: string): Promise<boolean> {
    return this.snapshot(async (daos) => {
      const access = await viewerAccessOf(daos.members, campaignId, userId);
      if (access.isMaster()) return true;
      for (const sheetId of await daos.templates.sheetIdsUsingAsset(campaignId, assetId)) {
        const rules = await sheetRulesOf(daos, this.holders, access, sheetId);
        if (rules?.canRead()) return true;
      }
      return false;
    });
  }
}
