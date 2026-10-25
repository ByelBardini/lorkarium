import { describe, expect, it } from 'vitest';
import {
  NO_AURA_PO,
  lookAssetIdsOf,
  toTokenAuraDto,
  toTokenAuraPo,
  toTokenStylePo,
} from '../../../src/modules/tokens/token-aura.mapper';
import { LYRA_PORTRAIT_ID } from '../../support/assets-factories';
import {
  FIRE_AURA,
  GOLD_AURA,
  LYRA_ID,
  fireAuraColumns,
  lyraPo,
} from '../../support/tokens-factories';

const RUNE_ID = '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f';
const RUNE_AURA = { kind: 'image', radius: 1, imageAssetId: RUNE_ID, opacity: 80 } as const;

describe('toTokenAuraPo', () => {
  it('a fire aura becomes its six columns, the radius to the hundredth and no color', () => {
    expect(toTokenAuraPo(FIRE_AURA)).toEqual(fireAuraColumns());
  });

  it('a radius of 2.345 cells is saved as "2.35"', () => {
    expect(toTokenAuraPo({ ...GOLD_AURA, radius: 2.345 }).auraRadius).toBe('2.35');
  });

  it('a gold tint keeps its color and no effect nor image', () => {
    expect(toTokenAuraPo(GOLD_AURA)).toEqual({
      ...NO_AURA_PO,
      auraKind: 'color',
      auraRadius: '2.00',
      auraColor: 'gold',
      auraOpacity: 50,
    });
  });

  it('an image aura keeps its asset and no color nor effect', () => {
    expect(toTokenAuraPo(RUNE_AURA)).toEqual({
      ...NO_AURA_PO,
      auraKind: 'image',
      auraRadius: '1.00',
      auraImageAssetId: RUNE_ID,
      auraOpacity: 80,
    });
  });

  it('a fire aura tinted steel keeps the color with the effect', () => {
    expect(toTokenAuraPo({ ...FIRE_AURA, color: 'steel' })).toMatchObject({
      auraEffect: 'fire',
      auraColor: 'steel',
    });
  });

  it('no aura (null) is the six columns null', () => {
    expect(toTokenAuraPo(null)).toEqual({
      auraKind: null,
      auraRadius: null,
      auraColor: null,
      auraEffect: null,
      auraImageAssetId: null,
      auraOpacity: null,
    });
  });
});

describe('toTokenAuraDto', () => {
  it('the six columns of a fire aura come back as the effect with a null color', () => {
    expect(toTokenAuraDto(lyraPo(fireAuraColumns()))).toEqual({
      kind: 'effect',
      radius: 2,
      effect: 'fire',
      color: null,
      opacity: 100,
    });
  });

  it('a gold tint of "3.50" comes back as a color aura of 3.5 cells', () => {
    const tint = { ...NO_AURA_PO, auraKind: 'color', auraRadius: '3.50', auraOpacity: 50 } as const;

    expect(toTokenAuraDto(lyraPo({ ...tint, auraColor: 'gold' }))).toEqual({
      kind: 'color',
      radius: 3.5,
      color: 'gold',
      opacity: 50,
    });
  });

  it('an image aura with its asset comes back with the asset', () => {
    const image = {
      ...NO_AURA_PO,
      auraKind: 'image',
      auraRadius: '1.00',
      auraOpacity: 80,
    } as const;

    expect(toTokenAuraDto(lyraPo({ ...image, auraImageAssetId: RUNE_ID }))).toEqual(RUNE_AURA);
  });

  it('an image aura whose asset was deleted (set null) is no aura', () => {
    const lost = { ...NO_AURA_PO, auraKind: 'image', auraRadius: '1.00', auraOpacity: 80 } as const;

    expect(toTokenAuraDto(lyraPo(lost))).toBeNull();
  });

  it('a token without an aura has a null aura', () => {
    expect(toTokenAuraDto(lyraPo())).toBeNull();
  });

  it('a row with a radius of 21 cells throws citing the token and the radius', () => {
    const broken = lyraPo(fireAuraColumns({ auraRadius: '21.00' }));

    expect(() => toTokenAuraDto(broken)).toThrow(
      `Token ${LYRA_ID} has an invalid aura: Aura radius 21 is invalid: expected 0 to 20 cells.`,
    );
  });

  it('a row with an opacity of 5 throws citing the token and the opacity', () => {
    const broken = lyraPo(fireAuraColumns({ auraOpacity: 5 }));

    expect(() => toTokenAuraDto(broken)).toThrow(`Token ${LYRA_ID} has an invalid aura`);
    expect(() => toTokenAuraDto(broken)).toThrow('Aura opacity 5 is invalid');
  });
});

describe('toTokenStylePo', () => {
  it('a style with an aura and a flip becomes the flip and the six aura columns', () => {
    expect(toTokenStylePo({ aura: FIRE_AURA, flipX: true })).toEqual({
      flipX: true,
      ...fireAuraColumns(),
    });
  });

  it('a style with aura null clears the six columns', () => {
    expect(toTokenStylePo({ aura: null })).toEqual(NO_AURA_PO);
  });

  it('a style without aura writes no aura column', () => {
    expect(toTokenStylePo({ defeated: true })).toEqual({ defeated: true });
  });
});

describe('lookAssetIdsOf', () => {
  it('a look with an image and an image aura names both assets', () => {
    expect(lookAssetIdsOf({ imageAssetId: LYRA_PORTRAIT_ID, aura: RUNE_AURA })).toEqual([
      LYRA_PORTRAIT_ID,
      RUNE_ID,
    ]);
  });

  it('a fire aura names no asset of its own', () => {
    expect(lookAssetIdsOf({ aura: FIRE_AURA })).toEqual([undefined, null]);
  });
});
