import { describe, expect, it } from 'vitest';
import { TokenRulesBo } from '../../../src/modules/tokens/token-rules.bo';
import {
  admitBlockersOf,
  newTokenRowOf,
  requireAssetsOf,
} from '../../../src/modules/tokens/token-transaction';
import type { NewTokenDto } from '@lorkarium/contracts';
import { VHARN_SCENE_ID } from '../../support/scenes-factories';
import { TokensDaoFake } from '../../support/tokens-fakes';
import { lyraPo, lyraRow } from '../../support/tokens-factories';
import { AssetsDaoFake } from '../../support/assets-fakes';
import { lyraPortraitPo, LYRA_PORTRAIT_ID } from '../../support/assets-factories';
import { VHARN_ID, QUELM_ID } from '../../support/campaigns-factories';
import { planAccount } from '../../support/plan-account-fakes';

const FRIEND_SCENE = { id: VHARN_SCENE_ID, owner: planAccount() };
const FREE_SCENE = { id: VHARN_SCENE_ID, owner: planAccount({ plan: 'free' }) };
describe('board asset references', () => {
  it('refuses a dedicated library image even when it belongs to the campaign', async () => {
    const assets = new AssetsDaoFake([], [lyraPortraitPo({ purpose: 'library_image' })]);
    await expect(requireAssetsOf({ assets }, VHARN_ID, [LYRA_PORTRAIT_ID])).rejects.toMatchObject({
      code: 'ASSET_NOT_FOUND',
    });
  });
  it('refuses the image of a library map even when it belongs to the campaign', async () => {
    const assets = new AssetsDaoFake([], [lyraPortraitPo({ purpose: 'library_map' })]);
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

describe('a token that blocks sight in a transaction', () => {
  const rules = new TokenRulesBo({
    scene: { widthCells: 20, heightCells: 12 },
    memberIds: [],
    barLimit: 99_999,
    tokenLimit: 500,
    blockerLimit: 1,
  });
  const STATUE: NewTokenDto = {
    name: 'Estátua',
    initials: 'ES',
    side: 'neutral',
    width: 1,
    height: 1,
    col: 2,
    row: 2,
    layer: 'objects',
    controllerIds: [],
    imageAssetId: null,
    frame: 'square',
    flipX: false,
    flipY: false,
    facing: 0,
    sightAngle: 360,
    aura: null,
    bars: [],
    hidden: false,
  };

  it('a new row carries the blocksSight sent', () => {
    const row = newTokenRowOf(VHARN_SCENE_ID, rules, { ...STATUE, blocksSight: true }, 'ana');

    expect(row.token.blocksSight).toBe(true);
  });

  it('a new row without the field does not block', () => {
    expect(newTokenRowOf(VHARN_SCENE_ID, rules, STATUE, 'ana').token.blocksSight).toBe(false);
  });

  it('nothing turning on neither reads the count nor refuses', async () => {
    const tokens = new TokensDaoFake([], [lyraRow({ token: lyraPo({ blocksSight: true }) })]);

    await admitBlockersOf({ tokens }, FREE_SCENE, rules, 0);

    expect(tokens.blockerCounts).toEqual([]);
  });

  it('one turning on past the limit is refused by the count of that scene', async () => {
    const tokens = new TokensDaoFake([], [lyraRow({ token: lyraPo({ blocksSight: true }) })]);

    const admitting = admitBlockersOf({ tokens }, FRIEND_SCENE, rules, 1);

    await expect(admitting).rejects.toMatchObject({ code: 'TOKEN_BLOCKER_LIMIT', stored: 1 });
    expect(tokens.blockerCounts).toEqual([VHARN_SCENE_ID]);
  });

  it('the first one on a free table is PLAN_LIMIT sightBlockers before the technical ceiling', async () => {
    const tokens = new TokensDaoFake([], []);

    const admitting = admitBlockersOf({ tokens }, FREE_SCENE, rules, 1);

    await expect(admitting).rejects.toMatchObject({
      code: 'PLAN_LIMIT',
      resource: 'sightBlockers',
      limit: 0,
    });
  });
});
