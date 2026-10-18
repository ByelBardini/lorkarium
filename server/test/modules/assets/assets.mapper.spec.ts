import { describe, expect, it } from 'vitest';
import { storageKeyOf, toAssetDto, toNewAssetPo } from '../../../src/modules/assets/assets.mapper';
import { LYRA_PORTRAIT_ID, lyraPortraitPo } from '../../support/assets-factories';
import { BIA_ID, VHARN_ID } from '../../support/campaigns-factories';

const IMAGE = {
  bytes: Uint8Array.from([1, 2, 3, 4, 5]),
  mimeType: 'image/webp',
  width: 1024,
  height: 768,
} as const;

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
    });
  });

  it('the DTO carries id, type and pixels, without the key or the owner', () => {
    expect(toAssetDto(lyraPortraitPo({ ownerId: BIA_ID }))).toEqual({
      id: LYRA_PORTRAIT_ID,
      mimeType: 'image/png',
      width: 400,
      height: 400,
    });
  });
});
