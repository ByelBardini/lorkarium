import type { SheetTemplateAssetDto, SheetTemplateAssetMimeTypeDto } from '@lorkarium/contracts';
import type { AssetsService } from '../assets/assets.service';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf } from '../campaigns/member-access';
import type { LibraryRequester } from '../library/library.service';

const SEND_ACTION = 'send a sheet template asset';

export type SheetTemplateAssetsDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  assets: Pick<AssetsService, 'uploadSheetTemplateAsset'>;
}>;

/** The fonts and images of the templates: only a master sends them, refused before the body is
 *  read; the template's manifest then names them by path.
 *
 *  Example: `await templateAssets.upload({ userId, campaignId }, bytes, 'font/woff2')` */
export class SheetTemplateAssetsService {
  constructor(private readonly deps: SheetTemplateAssetsDeps) {}

  async authorizeSender(requester: LibraryRequester): Promise<void> {
    const { campaignId, userId } = requester;
    (await memberAccessOf(this.deps.members, campaignId, userId)).requireMaster(SEND_ACTION);
  }

  async upload(
    requester: LibraryRequester,
    bytes: Uint8Array,
    mimeType: SheetTemplateAssetMimeTypeDto,
  ): Promise<SheetTemplateAssetDto> {
    await this.authorizeSender(requester);
    const { campaignId, userId } = requester;
    return this.deps.assets.uploadSheetTemplateAsset(userId, campaignId, { bytes, mimeType });
  }
}
