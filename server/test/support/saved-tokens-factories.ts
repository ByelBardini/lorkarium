import type {
  NewSavedTokenPo,
  SavedTokenBodyPo,
  SavedTokenFormInputPo,
} from '../../src/modules/saved-tokens/saved-tokens.po';

/** The body of Bia's "Zumbi": 1×1 enemy with PV 12 and a green color aura.
 *
 *  Example: `zombieBodyPo({ width: 2 })` */
export function zombieBodyPo(overrides: Partial<SavedTokenBodyPo> = {}): SavedTokenBodyPo {
  return {
    name: 'Zumbi',
    initials: 'ZB',
    side: 'enemy',
    width: 1,
    height: 1,
    layer: 'tokens',
    frame: 'round',
    flipX: false,
    flipY: false,
    facing: 0,
    sightAngle: 360,
    aura: { kind: 'color', radius: 1, opacity: 60, color: '#22aa44' },
    bars: [
      {
        label: 'PV',
        current: 12,
        max: 12,
        temp: 0,
        color: '#cc2222',
        visibility: 'everyone',
        display: 'number',
      },
    ],
    ...overrides,
  };
}

/** A saved token row of `userId` at `campaignId`, named `name`.
 *
 *  Example: `await dao.insert(savedTokenPo({ campaignId, userId: biaId }), [])` */
export function savedTokenPo(
  owner: Readonly<{ campaignId: string; userId: string }>,
  overrides: Partial<NewSavedTokenPo> = {},
): NewSavedTokenPo {
  return {
    ...owner,
    name: 'Zumbi',
    imageAssetId: null,
    auraImageAssetId: null,
    activeForm: null,
    body: zombieBodyPo(),
    ...overrides,
  };
}

/** The "Podre" form of the zombie (2×2, round), with `imageAssetId` when given.
 *
 *  Example: `rottenFormPo(assetId)` */
export function rottenFormPo(imageAssetId: string | null = null): SavedTokenFormInputPo {
  return { name: 'Podre', imageAssetId, width: 2, height: 2, frame: 'round' };
}
