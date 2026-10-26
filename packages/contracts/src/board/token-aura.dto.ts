import { z } from 'zod';
import { drawingColorDto } from './drawing.dto';

/** The ready-made animated auras, by name (the client keeps the shaders and the natural tones). */
export const AURA_EFFECTS = [
  'fire',
  'water',
  'lightning',
  'frost',
  'radiant',
  'shadow',
  'poison',
  'arcane',
] as const;

/** One ready-made aura effect, never a free shader.
 *
 *  Example: `auraEffectDto.parse('fire')` */
export const auraEffectDto = z.enum(AURA_EFFECTS);
export type AuraEffectDto = z.infer<typeof auraEffectDto>;

/** The widest aura in cells past the token's edge (game-core `AURA_RADIUS_MAX`, rewritten because
 *  contracts depends only on zod). */
export const AURA_RADIUS_MAX = 20;
export const AURA_OPACITY_MIN = 10;
export const AURA_OPACITY_MAX = 100;

/** How an image aura is cut: the whole image in the aura's box, or a circle the image covers. */
export const AURA_IMAGE_SHAPES = ['square', 'round'] as const;

/** The cut of an image aura (`round` covers a circle around the whole token).
 *
 *  Example: `auraImageShapeDto.parse('round')` */
export const auraImageShapeDto = z.enum(AURA_IMAGE_SHAPES);
export type AuraImageShapeDto = z.infer<typeof auraImageShapeDto>;

const auraShape = {
  radius: z.number().min(0).max(AURA_RADIUS_MAX),
  opacity: z.number().int().min(AURA_OPACITY_MIN).max(AURA_OPACITY_MAX),
};

/** The aura around a token, seen by everyone: a tint, a ready-made effect (`color: null` is its
 *  natural tone) or an image of the table (`shape` absent = `square`, as before it existed).
 *  `radius` is in cells past the token's edge.
 *
 *  Example: `tokenAuraDto.parse({ kind: 'effect', radius: 2, effect: 'fire', color: null, opacity: 100 })` */
export const tokenAuraDto = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('color'), ...auraShape, color: drawingColorDto }),
  z.strictObject({
    kind: z.literal('effect'),
    ...auraShape,
    effect: auraEffectDto,
    color: drawingColorDto.nullable(),
  }),
  z.strictObject({
    kind: z.literal('image'),
    ...auraShape,
    imageAssetId: z.uuid(),
    shape: auraImageShapeDto.default('square'),
  }),
]);
export type TokenAuraDto = z.infer<typeof tokenAuraDto>;
export type TokenAuraKindDto = TokenAuraDto['kind'];
