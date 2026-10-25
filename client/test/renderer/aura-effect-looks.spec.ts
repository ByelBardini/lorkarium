import { AURA_EFFECTS } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  AURA_EFFECT_LOOKS,
  auraColorChannels,
  auraEffectColorOf,
  auraQuadPositions,
  auraUniformsOf,
} from '@/renderer/aura-effect-looks';
import { CELL_WORLD_SIZE } from '@/renderer/camera';

const C = CELL_WORLD_SIZE;
const LYRA_BOX = { x: 5 * C, y: 5 * C, width: C, height: C };

function lyraUniforms(tokenId = 'lyra') {
  return auraUniformsOf({
    box: LYRA_BOX,
    radiusCells: 2,
    cellSize: C,
    opacity: 100,
    color: 0xff7a2a,
    tokenId,
  });
}

describe('aura effect looks', () => {
  // Written by hand: a new effect in the contracts without a look breaks this table.
  it.each([...AURA_EFFECTS])('%s has a natural color and a blend', (effect) => {
    const look = AURA_EFFECT_LOOKS[effect];
    expect(look.naturalColor).toBeGreaterThan(0);
    expect(['normal', 'add']).toContain(look.blend);
  });

  it('natural fire takes the natural fire color', () => {
    expect(auraEffectColorOf('fire', null)).toBe(AURA_EFFECT_LOOKS.fire.naturalColor);
  });

  it('fire tinted steel takes the steel tone of the palette', () => {
    expect(auraEffectColorOf('fire', 'steel')).toBe(0x8a9bb8);
  });

  it('shadow has a dark natural color and is laid over the floor, not added', () => {
    const [red, green, blue] = auraColorChannels(AURA_EFFECT_LOOKS.shadow.naturalColor);
    expect(0.2126 * red + 0.7152 * green + 0.0722 * blue).toBeLessThan(0.15);
    expect(AURA_EFFECT_LOOKS.shadow.blend).toBe('normal');
  });

  it.each(AURA_EFFECTS.filter((effect) => effect !== 'shadow'))(
    '%s glows, added to the floor',
    (effect) => {
      expect(AURA_EFFECT_LOOKS[effect].blend).toBe('add');
    },
  );

  it('a color splits into 0..1 channels for the shader', () => {
    expect(auraColorChannels(0xff0080)).toEqual([1, 0, 128 / 255]);
  });
});

describe('aura uniforms', () => {
  it('Lyra 1×1 with radius 2 at cell 64 gives half box 32×32, radius 128 px and opacity 1', () => {
    const uniforms = lyraUniforms();
    expect(uniforms.halfBox).toEqual([32, 32]);
    expect(uniforms.radius).toBe(128);
    expect(uniforms.opacity).toBe(1);
    expect(uniforms.cellSize).toBe(64);
  });

  it('the center is the middle of the token box', () => {
    expect(lyraUniforms().center).toEqual({ x: 5.5 * C, y: 5.5 * C });
  });

  it('opacity 50 becomes 0.5', () => {
    const half = auraUniformsOf({
      box: LYRA_BOX,
      radiusCells: 1,
      cellSize: C,
      opacity: 50,
      color: 0,
      tokenId: 'lyra',
    });
    expect(half.opacity).toBe(0.5);
  });

  it('the seed is stable for the same token and different for two tokens', () => {
    expect(lyraUniforms('lyra').seed).toBe(lyraUniforms('lyra').seed);
    expect(lyraUniforms('lyra').seed).not.toBe(lyraUniforms('goblin').seed);
  });

  it('the seed stays small enough for float precision in the shader', () => {
    const seed = lyraUniforms('a-very-long-token-id-0000-1111-2222').seed;
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(1);
  });

  it('the quad spans the token grown by the radius, around the center', () => {
    expect(Array.from(auraQuadPositions(lyraUniforms()))).toEqual([
      -160, -160, 160, -160, 160, 160, -160, 160,
    ]);
  });

  it('a 2×1 token with radius 1 makes a 256 × 192 quad', () => {
    const horse = auraUniformsOf({
      box: { x: 0, y: 0, width: 2 * C, height: C },
      radiusCells: 1,
      cellSize: C,
      opacity: 100,
      color: 0,
      tokenId: 'horse',
    });
    expect(Array.from(auraQuadPositions(horse)).slice(4, 6)).toEqual([128, 96]);
  });
});
