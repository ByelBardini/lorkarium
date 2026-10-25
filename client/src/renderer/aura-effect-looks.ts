import type { AuraEffectDto, DrawingColorDto } from '@lorkarium/contracts';
import { stableHash } from '@lorkarium/game-core';
import { drawingColorValue } from '@/lib/drawing-style';
import type { Point } from './camera';
import type { WorldRect } from './token-box';

/** How an effect lands on the floor: added to it (light) or laid over it (darkness). */
export type AuraBlend = 'normal' | 'add';

/** The fixed look of a ready-made effect: its tone when nobody picked a color, and its blend. */
export type AuraEffectLook = Readonly<{ naturalColor: number; blend: AuraBlend }>;

// Shadow is the one dark effect: added on top it would vanish, so it is laid over the floor.
export const AURA_EFFECT_LOOKS: Readonly<Record<AuraEffectDto, AuraEffectLook>> = {
  fire: { naturalColor: 0xff7a2a, blend: 'add' },
  water: { naturalColor: 0x3a8fd6, blend: 'add' },
  lightning: { naturalColor: 0x9fd8ff, blend: 'add' },
  frost: { naturalColor: 0xbfe9ff, blend: 'add' },
  radiant: { naturalColor: 0xffe08a, blend: 'add' },
  shadow: { naturalColor: 0x1c1426, blend: 'normal' },
  poison: { naturalColor: 0x6fd13a, blend: 'add' },
  arcane: { naturalColor: 0xb070ff, blend: 'add' },
};

/** The tone an effect is drawn in: the palette color picked, or its natural one (`null`).
 *
 *  Example: `auraEffectColorOf('fire', 'steel') // 0x8a9bb8` */
export function auraEffectColorOf(effect: AuraEffectDto, color: DrawingColorDto | null): number {
  if (color === null) return AURA_EFFECT_LOOKS[effect].naturalColor;
  return drawingColorValue(color);
}

/** A 0xrrggbb color as the 0..1 channels a `vec3` uniform reads.
 *
 *  Example: `auraColorChannels(0xff0000) // [1, 0, 0]` */
export function auraColorChannels(color: number): [number, number, number] {
  return [((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255];
}

/** What turns an aura into shader values: the token box in world px, the radius in cells past
 *  its edge, the opacity in percent (10–100), the tone and the token (for the seed). */
export type AuraUniformsInput = Readonly<{
  box: WorldRect;
  radiusCells: number;
  cellSize: number;
  opacity: number;
  color: number;
  tokenId: string;
}>;

/** The values the aura shader reads, in world px around the token center. */
export type AuraUniforms = Readonly<{
  center: Point;
  halfBox: readonly [number, number];
  radius: number;
  cellSize: number;
  opacity: number;
  color: number;
  seed: number;
}>;

// A prime modulus keeps the seed in [0, 1): a raw 32-bit hash loses all precision as a float.
const SEED_MODULUS = 997;

/** The shader values of one aura; the seed is stable per token, so two fires never pulse alike.
 *
 *  Example: `auraUniformsOf({ box, radiusCells: 2, cellSize: 64, opacity: 100, color, tokenId })` */
export function auraUniformsOf(input: AuraUniformsInput): AuraUniforms {
  const { box, cellSize } = input;
  return {
    center: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    halfBox: [box.width / 2, box.height / 2],
    radius: input.radiusCells * cellSize,
    cellSize,
    opacity: input.opacity / 100,
    color: input.color,
    seed: (stableHash(input.tokenId) % SEED_MODULUS) / SEED_MODULUS,
  };
}

/** The four corners (x, y pairs, clockwise from the top left) of the quad that holds the aura:
 *  the token box grown by the radius, relative to the center.
 *
 *  Example: `geometry.positions.set(auraQuadPositions(uniforms))` */
export function auraQuadPositions(uniforms: AuraUniforms): Float32Array {
  const halfWidth = uniforms.halfBox[0] + uniforms.radius;
  const halfHeight = uniforms.halfBox[1] + uniforms.radius;
  return new Float32Array([
    -halfWidth,
    -halfHeight,
    halfWidth,
    -halfHeight,
    halfWidth,
    halfHeight,
    -halfWidth,
    halfHeight,
  ]);
}
