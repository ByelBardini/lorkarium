import type { CampaignCoverDto } from '@lorkarium/contracts';

export const PHOTO_ASSET_ID = 'a1b2c3d4-0001-4aaa-8bbb-000000000001';
export const COVER_ASSET_ID = 'a1b2c3d4-0002-4aaa-8bbb-000000000002';
export const BANNER_ASSET_ID = 'a1b2c3d4-0003-4aaa-8bbb-000000000003';

export const PHOTO_URL = `/api/assets/${PHOTO_ASSET_ID}`;
export const COVER_URL = `/api/assets/${COVER_ASSET_ID}`;
export const BANNER_URL = `/api/assets/${BANNER_ASSET_ID}`;

type DistinctImages = Readonly<{
  cover: CampaignCoverDto;
  photoAssetId: string;
  bannerAssetId: string;
}>;

/** The campaign with a photo, a cover and a banner that are three different images, so a screen
 *  proves which format it draws by the `src` alone.
 *
 *  Example: `renderRow(withDistinctImages(VHARN))` */
export function withDistinctImages<T extends object>(campaign: T): T & DistinctImages {
  return {
    ...campaign,
    cover: { kind: 'image', assetId: COVER_ASSET_ID },
    photoAssetId: PHOTO_ASSET_ID,
    bannerAssetId: BANNER_ASSET_ID,
  };
}

/** The `src` of every image inside `element`, in document order.
 *
 *  Example: `expect(imageSourcesIn(row)).toEqual([PHOTO_URL])` */
export function imageSourcesIn(element: Element): string[] {
  return Array.from(element.querySelectorAll('img'), (image) => image.getAttribute('src') ?? '');
}
