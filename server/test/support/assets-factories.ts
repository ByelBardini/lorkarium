import type { AssetPo, NewAssetPo } from '../../src/modules/assets/assets.po';
import { VHARN_ID } from './campaigns-factories';

export const LYRA_PORTRAIT_ID = '4a3b2c1d-0e9f-4a8b-9c7d-6e5f4a3b2c1d';
export const QUELM_MAP_ID = '5b4c3d2e-1f0a-4b9c-8d7e-6f5a4b3c2d1e';

/** A 400×400 PNG token image of the campaign `campaignId`, sent by `ownerId`.
 *
 *  Example: `await assetsDao.insert(newAssetPo({ campaignId: vharn.id, ownerId: bia.id }))` */
export function newAssetPo(
  overrides: Partial<NewAssetPo> & Pick<NewAssetPo, 'campaignId'>,
): NewAssetPo {
  const storageKey = overrides.storageKey ?? `assets/${overrides.id ?? crypto.randomUUID()}`;
  return {
    ownerId: null,
    purpose: 'token',
    mimeType: 'image/png',
    sizeBytes: 48_213,
    width: 400,
    height: 400,
    ...overrides,
    storageKey,
  };
}

/** Lyra's portrait as stored in VHARN: the asset row the unit fakes hand out.
 *
 *  Example: `assetsDao.rows.push(lyraPortraitPo())` */
export function lyraPortraitPo(overrides: Partial<AssetPo> = {}): AssetPo {
  return {
    id: LYRA_PORTRAIT_ID,
    campaignId: VHARN_ID,
    ownerId: null,
    purpose: 'token',
    mimeType: 'image/png',
    sizeBytes: 48_213,
    width: 400,
    height: 400,
    storageKey: `assets/${LYRA_PORTRAIT_ID}`,
    sightOutline: null,
    createdAt: new Date('2026-10-17T12:00:00Z'),
    ...overrides,
  };
}

export const CHAT_IMAGE_ID = '6d7e8f9a-0b1c-4d2e-8f3a-4b5c6d7e8f9a';

/** A chat picture of VHARN sent at 2026-10-27 19:00 UTC: the row `chat:send` reads.
 *
 *  Example: `new ChatImagesFake().with(chatImagePo({ ownerId: BIA_ID }))` */
export function chatImagePo(overrides: Partial<AssetPo> = {}): AssetPo {
  return lyraPortraitPo({
    id: CHAT_IMAGE_ID,
    purpose: 'chat_image',
    width: 800,
    height: 600,
    storageKey: `assets/${overrides.id ?? CHAT_IMAGE_ID}`,
    createdAt: new Date('2026-10-27T19:00:00Z'),
    ...overrides,
  });
}
