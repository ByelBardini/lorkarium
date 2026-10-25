import type { TokenAuraDto } from '@lorkarium/contracts';

/** The rune image of the table that the image auras of the specs point to. */
export const RUNE_ASSET_ID = '6a1f3c2e-4b5d-4e8f-9a0b-1c2d3e4f5a6b';

/** A fire aura in its natural tone, two cells past the edge.
 *
 *  Example: `lyra({ aura: fireAura({ radius: 4 }) })` */
export function fireAura(
  overrides: Partial<Omit<Extract<TokenAuraDto, { kind: 'effect' }>, 'kind'>> = {},
): TokenAuraDto {
  return { kind: 'effect', radius: 2, effect: 'fire', color: null, opacity: 100, ...overrides };
}

/** A gold tint at half opacity, two cells past the edge.
 *
 *  Example: `lyra({ aura: goldAura() })` */
export function goldAura(
  overrides: Partial<Omit<Extract<TokenAuraDto, { kind: 'color' }>, 'kind'>> = {},
): TokenAuraDto {
  return { kind: 'color', radius: 2, color: 'gold', opacity: 50, ...overrides };
}

/** The rune image of the table as an aura, one cell past the edge.
 *
 *  Example: `kael({ aura: runeAura() })` */
export function runeAura(): TokenAuraDto {
  return { kind: 'image', radius: 1, imageAssetId: RUNE_ASSET_ID, opacity: 100 };
}
