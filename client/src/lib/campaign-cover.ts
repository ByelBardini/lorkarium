import type { CampaignCoverDto, DrawnCampaignCoverDto } from '@lorkarium/contracts';
import { defaultCoverOf } from '@lorkarium/game-core';

/** The shape a screen draws a campaign in: the 1:1 photo, the 2:1 cover or the 3:1 banner. */
export type CampaignImageFormat = 'photo' | 'cover' | 'banner';

/** What a campaign carries for its three formats. `undefined` (a server or a stored list from
 *  before the photo and the banner) reads as `null`. */
export type CampaignImages = Readonly<{
  cover: CampaignCoverDto;
  photoAssetId?: string | null;
  bannerAssetId?: string | null;
}>;

/** The cover a campaign shows before its own is known (a table reopened from what an older tab
 *  stored): the same drawing the server gives a campaign that never chose one.
 *
 *  Example: `fallbackCoverOf(campaign.id) // { kind: 'drawn', drawing: 1, tone: 3 }` */
export function fallbackCoverOf(campaignId: string): DrawnCampaignCoverDto {
  return { kind: 'drawn', ...defaultCoverOf(campaignId) };
}

/** The image a screen shows in a format: the photo or the banner when the master set one,
 *  otherwise the cover (image or drawing). The cover format never reads the other two.
 *
 *  Example: `campaignImageOf(campaign, 'photo') // { kind: 'image', assetId: campaign.photoAssetId }` */
export function campaignImageOf(
  campaign: CampaignImages,
  format: CampaignImageFormat,
): CampaignCoverDto {
  const own = ownAssetIdOf(campaign, format);
  return own ? { kind: 'image', assetId: own } : campaign.cover;
}

function ownAssetIdOf(campaign: CampaignImages, format: CampaignImageFormat): string | null {
  if (format === 'photo') return campaign.photoAssetId ?? null;
  if (format === 'banner') return campaign.bannerAssetId ?? null;
  return null;
}
