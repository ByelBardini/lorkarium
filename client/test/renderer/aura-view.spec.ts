import type { TokenAuraDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  auraHaloOf,
  auraImageBox,
  auraImageUrlsOf,
  auraKeyOf,
  auraViewOf,
  type AuraViewInput,
} from '@/renderer/aura-view';

const GOLD_TWO: TokenAuraDto = { kind: 'color', radius: 2, color: 'gold', opacity: 50 };
const AURA_IMAGE_ID = '0b9a4c1e-7f43-4d2b-9c1a-5e6f7a8b9c0d';

function lyraAt(overrides: Partial<AuraViewInput> = {}): AuraViewInput {
  return {
    col: 5,
    row: 5,
    width: 1,
    height: 1,
    aura: GOLD_TWO,
    hidden: false,
    ...overrides,
  };
}

describe('auraViewOf', () => {
  it('Lyra 1 × 1 at (5, 5) with radius 2 is the footprint grown by 2 cells, rounded by 128 px', () => {
    expect(auraViewOf(lyraAt())).toMatchObject({
      box: { x: 192, y: 192, width: 320, height: 320 },
      corner: 128,
    });
  });

  it('a 2 × 1 token with radius 1 grows by one cell to every side: 256 × 192', () => {
    const view = auraViewOf(lyraAt({ width: 2, aura: { ...GOLD_TWO, radius: 1 } }));
    expect(view?.box).toEqual({ x: 256, y: 256, width: 256, height: 192 });
  });

  it('radius 0 is only the footprint, with square corners', () => {
    const view = auraViewOf(lyraAt({ aura: { ...GOLD_TWO, radius: 0 } }));
    expect(view).toMatchObject({ box: { x: 320, y: 320, width: 64, height: 64 }, corner: 0 });
  });

  it('a color aura paints its palette tone: ember is 0xb5654f', () => {
    const view = auraViewOf(lyraAt({ aura: { ...GOLD_TWO, color: 'ember' } }));
    expect(view?.look).toEqual({ kind: 'color', color: 0xb5654f });
  });

  it('opacity 50 is drawn at alpha 0.5', () => {
    expect(auraViewOf(lyraAt())?.alpha).toBe(0.5);
  });

  it('a token hidden from the players (seen by the master) fades its aura like its face: × 0.55', () => {
    expect(auraViewOf(lyraAt({ hidden: true }))?.alpha).toBeCloseTo(0.275);
  });

  it('a token without aura has none', () => {
    expect(auraViewOf(lyraAt({ aura: null }))).toBeNull();
  });

  it('an effect keeps its name and its tint, null for the natural tone', () => {
    const fire: TokenAuraDto = {
      kind: 'effect',
      radius: 2,
      effect: 'fire',
      color: null,
      opacity: 100,
    };
    expect(auraViewOf(lyraAt({ aura: fire }))?.look).toEqual({
      kind: 'effect',
      effect: 'fire',
      tint: null,
    });
    const steel = auraViewOf(lyraAt({ aura: { ...fire, color: 'steel' } }));
    expect(steel?.look).toEqual({ kind: 'effect', effect: 'fire', tint: 0x8a9bb8 });
  });

  it('an image aura points at the asset of the table', () => {
    const image: TokenAuraDto = {
      kind: 'image',
      radius: 1,
      imageAssetId: AURA_IMAGE_ID,
      opacity: 100,
    };
    expect(auraViewOf(lyraAt({ aura: image }))?.look).toEqual({
      kind: 'image',
      url: `/api/assets/${AURA_IMAGE_ID}`,
    });
  });
});

describe('auraKeyOf', () => {
  it('the same aura on a new cell keeps its key: the glide moves it, nothing redraws', () => {
    expect(auraKeyOf(auraViewOf(lyraAt({ col: 9, row: 1 })))).toBe(auraKeyOf(auraViewOf(lyraAt())));
  });

  it.each<[string, Partial<AuraViewInput>]>([
    ['a new radius', { aura: { ...GOLD_TWO, radius: 3 } }],
    ['a new color', { aura: { ...GOLD_TWO, color: 'moss' } }],
    ['a new opacity', { aura: { ...GOLD_TWO, opacity: 80 } }],
    ['a new size', { width: 2 }],
    ['being hidden', { hidden: true }],
    ['losing the aura', { aura: null }],
  ])('%s changes the key', (_, change) => {
    expect(auraKeyOf(auraViewOf(lyraAt(change)))).not.toBe(auraKeyOf(auraViewOf(lyraAt())));
  });
});

describe('auraHaloOf', () => {
  it('the halo of radius 2 fades in over a 32 px band, in 4 steps inset by 8 px, from the aura corner', () => {
    const view = auraViewOf(lyraAt());
    const steps = view ? auraHaloOf(view) : [];
    expect(steps.map(({ x, y, width, radius }) => [x, y, width, radius])).toEqual([
      [-128, -128, 320, 128],
      [-120, -120, 304, 120],
      [-112, -112, 288, 112],
      [-104, -104, 272, 104],
    ]);
  });

  it('the steps stack up to the aura opacity in the middle: 0.5 is 0.125, 1/7, 1/6 and 0.2', () => {
    const view = auraViewOf(lyraAt());
    const alphas = view ? auraHaloOf(view).map(({ alpha }) => alpha) : [];
    expect(alphas[0]).toBeCloseTo(0.125);
    expect(alphas[1]).toBeCloseTo(1 / 7);
    expect(alphas[2]).toBeCloseTo(1 / 6);
    expect(alphas[3]).toBeCloseTo(0.2);
  });

  it('radius 0 still softens the footprint edge, over 4 px, with square corners', () => {
    const view = auraViewOf(lyraAt({ aura: { ...GOLD_TWO, radius: 0 } }));
    const steps = view ? auraHaloOf(view) : [];
    expect(steps.map(({ x, width, radius }) => [x, width, radius])).toEqual([
      [0, 64, 0],
      [1, 62, 0],
      [2, 60, 0],
      [3, 58, 0],
    ]);
  });
});

describe('auraImageBox', () => {
  it('an image of 400 × 600 fits whole in the 320 × 320 aura, centered, from the token corner', () => {
    const view = auraViewOf(lyraAt());
    const box = view ? auraImageBox(view, { width: 400, height: 600 }) : null;
    expect(box?.x).toBeCloseTo(-128 + 53.33, 1);
    expect(box?.y).toBe(-128);
    expect(box?.width).toBeCloseTo(213.33, 1);
    expect(box?.height).toBe(320);
  });
});

describe('auraImageUrlsOf', () => {
  it('collects the image of every image aura once, and no color or effect', () => {
    const rune = { kind: 'image', url: '/api/assets/rune' } as const;
    const looks = [rune, { kind: 'color', color: 1 }, rune] as const;
    const tokens = looks.map((look) => ({ aura: { ...auraViewOf(lyraAt())!, look } }));
    expect(auraImageUrlsOf([...tokens, { aura: null }])).toEqual(new Set(['/api/assets/rune']));
  });
});
