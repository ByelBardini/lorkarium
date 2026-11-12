import { describe, expect, it } from 'vitest';
import {
  storageKeyOf,
  toAssetDto,
  toAssetOutlineDto,
  toImageCrop,
  toNewAssetPo,
} from '../../../src/modules/assets/assets.mapper';
import { LYRA_PORTRAIT_ID, lyraPortraitPo } from '../../support/assets-factories';
import { BIA_ID, VHARN_ID } from '../../support/campaigns-factories';

const IMAGE = {
  bytes: Uint8Array.from([1, 2, 3, 4, 5]),
  mimeType: 'image/webp',
  width: 1024,
  height: 768,
  outline: null,
} as const;
const TRIANGLE: readonly (readonly (readonly [number, number])[])[] = [
  [
    [0.5, 0],
    [1, 1],
    [0, 1],
  ],
];

describe('assets mapper', () => {
  it('the storage key is assets/ and the id, never a file name', () => {
    expect(storageKeyOf(LYRA_PORTRAIT_ID)).toBe(`assets/${LYRA_PORTRAIT_ID}`);
  });

  it('the new row keeps the normalized type, size and pixels with the owner and the key', () => {
    const row = toNewAssetPo({
      assetId: LYRA_PORTRAIT_ID,
      campaignId: VHARN_ID,
      ownerId: BIA_ID,
      purpose: 'token',
      image: IMAGE,
    });

    expect(row).toEqual({
      id: LYRA_PORTRAIT_ID,
      campaignId: VHARN_ID,
      ownerId: BIA_ID,
      purpose: 'token',
      mimeType: 'image/webp',
      sizeBytes: 5,
      width: 1024,
      height: 768,
      storageKey: `assets/${LYRA_PORTRAIT_ID}`,
      sightOutline: null,
    });
  });

  it('the new row keeps the outline traced from the image', () => {
    const row = toNewAssetPo({
      assetId: LYRA_PORTRAIT_ID,
      campaignId: VHARN_ID,
      ownerId: BIA_ID,
      purpose: 'token',
      image: { ...IMAGE, outline: TRIANGLE },
    });

    expect(row.sightOutline).toEqual([
      [
        [0.5, 0],
        [1, 1],
        [0, 1],
      ],
    ]);
  });

  it('the DTO carries id, type and pixels, without the key or the owner', () => {
    expect(toAssetDto(lyraPortraitPo({ ownerId: BIA_ID }))).toEqual({
      id: LYRA_PORTRAIT_ID,
      mimeType: 'image/png',
      width: 400,
      height: 400,
    });
  });

  it('the outline DTO carries the stored polygons', () => {
    expect(toAssetOutlineDto(lyraPortraitPo({ sightOutline: TRIANGLE }))).toEqual({
      outline: [
        [
          [0.5, 0],
          [1, 1],
          [0, 1],
        ],
      ],
    });
  });

  it('the outline DTO of a fully transparent image keeps the empty list', () => {
    expect(toAssetOutlineDto(lyraPortraitPo({ sightOutline: [] }))).toEqual({ outline: [] });
  });

  it('the outline DTO of an image without one is null', () => {
    expect(toAssetOutlineDto(lyraPortraitPo({ sightOutline: null }))).toEqual({ outline: null });
  });

  it('the four crop fields of the upload query become the rectangle in percent', () => {
    const query = { purpose: 'cover', cropX: 0, cropY: 12.5, cropW: 100, cropH: 50 } as const;

    expect(toImageCrop(query)).toEqual({ x: 0, y: 12.5, w: 100, h: 50 });
  });

  it('an upload query with no crop field has no rectangle', () => {
    expect(toImageCrop({ purpose: 'campaign_banner' })).toBeNull();
  });
});
