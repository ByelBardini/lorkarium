import type { AssetDto } from '@lorkarium/contracts';
import type { AssetsService } from '../assets/assets.service';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import type { CampaignsDao } from '../campaigns/campaigns.dao';
import { CampaignNotFoundError } from '../campaigns/campaigns.error';
import { viewerAccessOf } from '../campaigns/member-access';
import type { LibraryRequester } from '../library/library.service';
import type { SheetAccessBo } from './sheet-access.bo';
import type { SheetAssetsDao } from './sheet-assets.dao';
import type { SheetHolderDaos, SheetHolderService } from './sheet-holder.service';
import type { SheetsDao } from './sheets.dao';
import { SheetNotFoundError } from './sheets.error';
import { holderPlaceIn, toSheetAccessBo } from './sheets.mapper';

/** What the images of a sheet read, all on one executor. */
export type SheetImageDaos = SheetHolderDaos &
  Readonly<{
    members: Pick<CampaignMembersDao, 'findMembership'>;
    campaigns: Pick<CampaignsDao, 'lockById'>;
    sheets: SheetHolderDaos['sheets'] & Pick<SheetsDao, 'find' | 'findLines' | 'holdersOf'>;
    sheetAssets: Pick<SheetAssetsDao, 'associate' | 'sheetsOfAsset'>;
  }>;

export type SheetImageWork = <T>(work: (daos: SheetImageDaos) => Promise<T>) => Promise<T>;

export type SheetImagesDeps = Readonly<{
  snapshot: SheetImageWork;
  transaction: SheetImageWork;
  holders: Pick<SheetHolderService, 'placeOfSheet'>;
  assets: Pick<AssetsService, 'uploadSheetImage'>;
}>;

const SEND_ACTION = 'send an image to';

/** What one member may do with one sheet, or `null` when the campaign has no such sheet.
 *
 *  Example: `(await sheetRulesOf(daos, holders, access, sheetId))?.canRead() // false for Caio on a controllers sheet` */
export async function sheetRulesOf(
  daos: SheetImageDaos,
  holders: SheetImagesDeps['holders'],
  access: CampaignAccessBo,
  sheetId: string,
): Promise<SheetAccessBo | null> {
  const sheet = await daos.sheets.find(access.campaignIdOf(), sheetId);
  if (!sheet) return null;
  return toSheetAccessBo(access, sheet, await holders.placeOfSheet(daos, sheet));
}

/** Whether `access` reads at least one of the sheets, in a constant number of queries: the
 *  sheets in one read (without values), their holders in bulk.
 *
 *  Example: `await readsAnySheet(daos, caioAccess, await daos.sheetAssets.sheetsOfAsset(vharnId, imageId))` */
export async function readsAnySheet(
  daos: SheetImageDaos,
  access: CampaignAccessBo,
  sheetIds: readonly string[],
): Promise<boolean> {
  const sheets = await daos.sheets.findLines(access.campaignIdOf(), sheetIds);
  const places = await daos.sheets.holdersOf(access.campaignIdOf(), sheets);
  return sheets.some((sheet) =>
    toSheetAccessBo(access, sheet, holderPlaceIn(sheet, places)).canRead(),
  );
}

/** Images sent to a sheet by who edits it: authorized before the image is decoded and kept, then
 *  tied to the sheet under the table's lock after authorizing again (no S3 under the lock). A
 *  right lost in between leaves an orphan nobody reads.
 *
 *  Example: `await sheetImages.upload({ userId, campaignId }, sheetId, bytes)` */
export class SheetImagesService {
  constructor(private readonly deps: SheetImagesDeps) {}

  /** Refuses who may not send an image to the sheet: SHEET_NOT_FOUND if they do not read it,
   *  FORBIDDEN if they only read it. */
  async authorizeSender(requester: LibraryRequester, sheetId: string): Promise<void> {
    await this.deps.snapshot((daos) => this.requireSender(daos, requester, sheetId));
  }

  async upload(requester: LibraryRequester, sheetId: string, bytes: Uint8Array): Promise<AssetDto> {
    await this.authorizeSender(requester, sheetId);
    const { userId, campaignId } = requester;
    const asset = await this.deps.assets.uploadSheetImage(userId, campaignId, bytes);
    await this.deps.transaction(async (daos) => {
      if (!(await daos.campaigns.lockById(campaignId))) throw new CampaignNotFoundError(requester);
      await this.requireSender(daos, requester, sheetId);
      await daos.sheetAssets.associate(campaignId, sheetId, asset.id);
    });
    return asset;
  }

  private async requireSender(
    daos: SheetImageDaos,
    requester: LibraryRequester,
    sheetId: string,
  ): Promise<void> {
    const access = await viewerAccessOf(daos.members, requester.campaignId, requester.userId);
    const rules = await sheetRulesOf(daos, this.deps.holders, access, sheetId);
    if (!rules) throw new SheetNotFoundError(requester.campaignId, `sheet ${sheetId}`);
    rules.requireEdit(SEND_ACTION);
  }
}
