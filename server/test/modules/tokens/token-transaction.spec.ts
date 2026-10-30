import { describe, expect, it } from 'vitest';
import { requireAssetsOf } from '../../../src/modules/tokens/token-transaction';
import { AssetsDaoFake } from '../../support/assets-fakes';
import { lyraPortraitPo, LYRA_PORTRAIT_ID } from '../../support/assets-factories';
import { VHARN_ID, QUELM_ID } from '../../support/campaigns-factories';
describe('board asset references', () => {
  it('refuses a dedicated library image even when it belongs to the campaign', async () => {
    const assets = new AssetsDaoFake([], [lyraPortraitPo({ purpose: 'library_image' })]);
    await expect(requireAssetsOf({ assets }, VHARN_ID, [LYRA_PORTRAIT_ID])).rejects.toMatchObject({
      code: 'ASSET_NOT_FOUND',
    });
  });
  it('keeps ordinary purposes reusable and ignores absent references', async () => {
    const assets = new AssetsDaoFake([], [lyraPortraitPo()]);
    await requireAssetsOf({ assets }, VHARN_ID, [
      null,
      undefined,
      LYRA_PORTRAIT_ID,
      LYRA_PORTRAIT_ID,
    ]);
    expect(assets.lookups).toEqual([[LYRA_PORTRAIT_ID]]);
  });
  it('refuses another campaign ordinary asset', async () => {
    const assets = new AssetsDaoFake([], [lyraPortraitPo({ campaignId: QUELM_ID })]);
    await expect(requireAssetsOf({ assets }, VHARN_ID, [LYRA_PORTRAIT_ID])).rejects.toMatchObject({
      code: 'ASSET_NOT_FOUND',
    });
  });
});
