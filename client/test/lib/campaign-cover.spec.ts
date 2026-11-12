import { describe, expect, it } from 'vitest';
import { campaignImageOf, fallbackCoverOf, type CampaignImages } from '@/lib/campaign-cover';

const PHOTO_ID = 'a1a1a1a1-0000-4000-8000-000000000001';
const COVER_ID = 'c2c2c2c2-0000-4000-8000-000000000002';
const BANNER_ID = 'b3b3b3b3-0000-4000-8000-000000000003';

const COVER_IMAGE = { kind: 'image', assetId: COVER_ID } as const;
const COVER_DRAWN = { kind: 'drawn', drawing: 2, tone: 4 } as const;

const ALL_THREE: CampaignImages = {
  cover: COVER_IMAGE,
  photoAssetId: PHOTO_ID,
  bannerAssetId: BANNER_ID,
};

describe('fallbackCoverOf', () => {
  // 'ab' → 97 * 31 + 98 = 3105: 3105 % 3 = 0, 3105 % 4 = 1.
  it('id "ab" gives the drawn cover with drawing 0 and tone 2', () => {
    expect(fallbackCoverOf('ab')).toEqual({ kind: 'drawn', drawing: 0, tone: 2 });
  });

  // 'b' → 98: 98 % 3 = 2, 98 % 4 = 2.
  it('id "b" gives the drawn cover with drawing 2 and tone 3', () => {
    expect(fallbackCoverOf('b')).toEqual({ kind: 'drawn', drawing: 2, tone: 3 });
  });
});

describe('campaignImageOf', () => {
  it('the photo format of a campaign with a photo is the photo image', () => {
    expect(campaignImageOf(ALL_THREE, 'photo')).toEqual({ kind: 'image', assetId: PHOTO_ID });
  });

  it('the banner format of a campaign with a banner is the banner image', () => {
    expect(campaignImageOf(ALL_THREE, 'banner')).toEqual({ kind: 'image', assetId: BANNER_ID });
  });

  it.each([
    ['photo', { cover: COVER_IMAGE, photoAssetId: null }],
    ['banner', { cover: COVER_IMAGE, bannerAssetId: null }],
  ] as const)(
    'the %s format without its own image falls back to the cover image',
    (format, campaign) => {
      expect(campaignImageOf(campaign, format)).toEqual(COVER_IMAGE);
    },
  );

  it.each(['photo', 'banner'] as const)(
    'the %s format without its own image and with a drawn cover is the drawing',
    (format) => {
      expect(campaignImageOf({ cover: COVER_DRAWN, photoAssetId: null }, format)).toEqual(
        COVER_DRAWN,
      );
    },
  );

  it('a campaign from an older server (no photo nor banner field) falls back to the cover', () => {
    expect(campaignImageOf({ cover: COVER_DRAWN }, 'photo')).toEqual(COVER_DRAWN);
  });

  it('the cover format ignores the photo and the banner', () => {
    expect(campaignImageOf(ALL_THREE, 'cover')).toEqual(COVER_IMAGE);
  });
});
