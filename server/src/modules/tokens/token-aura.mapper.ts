import type { TokenAuraDto, TokenStyleDto } from '@lorkarium/contracts';
import { auraOpacity, auraRadius } from '@lorkarium/game-core';
import { cellsNumeric } from '../../database/cells-numeric';
import type { TokenAuraPo, TokenPo, TokenStylePo } from './tokens.po';

/** The six aura columns of a token without an aura: written whole to take one away. */
export const NO_AURA_PO: TokenAuraPo = Object.freeze({
  auraKind: null,
  auraRadius: null,
  auraColor: null,
  auraEffect: null,
  auraImageAssetId: null,
  auraOpacity: null,
});

/** An aura as sent → the six columns, the radius to the hundredth; every field the kind does not
 *  use is written null, so swapping kinds leaves nothing behind (and `null` clears all six).
 *
 *  Example: `toTokenAuraPo({ kind: 'color', radius: 2, color: 'gold', opacity: 50 }).auraRadius // '2.00'` */
export function toTokenAuraPo(aura: TokenAuraDto | null): TokenAuraPo {
  if (aura === null) return NO_AURA_PO;
  const shape = {
    ...NO_AURA_PO,
    auraKind: aura.kind,
    auraRadius: cellsNumeric(aura.radius),
    auraOpacity: aura.opacity,
  };
  if (aura.kind === 'color') return { ...shape, auraColor: aura.color };
  if (aura.kind === 'effect') return { ...shape, auraEffect: aura.effect, auraColor: aura.color };
  return { ...shape, auraImageAssetId: aura.imageAssetId };
}

/** The saved aura of a token, checked by the game-core rule; an image aura whose asset was
 *  deleted (set null) reads as no aura. A row outside the rule throws citing the token.
 *
 *  Example: `toTokenAuraDto(row.token) // { kind: 'effect', radius: 2, effect: 'fire', color: null, opacity: 100 }` */
export function toTokenAuraDto(token: Pick<TokenPo, 'id'> & TokenAuraPo): TokenAuraDto | null {
  const { auraKind: kind, auraColor: color, auraEffect: effect, auraImageAssetId } = token;
  if (kind === null || token.auraRadius === null || token.auraOpacity === null) return null;
  const shape = checkedShapeOf(token.id, Number(token.auraRadius), token.auraOpacity);
  if (kind === 'color') return color === null ? null : { kind, ...shape, color };
  if (kind === 'effect') return effect === null ? null : { kind, ...shape, effect, color };
  return auraImageAssetId === null ? null : { kind, ...shape, imageAssetId: auraImageAssetId };
}

/** A restyle as sent → what the DAO writes: the look as it is and the aura as its six columns
 *  (left out when the style does not touch it).
 *
 *  Example: `toTokenStylePo({ aura: null, flipX: true }) // { flipX: true, auraKind: null, … }` */
export function toTokenStylePo(style: TokenStyleDto): Partial<TokenStylePo> {
  const { aura, ...look } = style;
  return aura === undefined ? look : { ...look, ...toTokenAuraPo(aura) };
}

/** The assets a look puts on a token: its image and the image of its aura, each of which must be
 *  of the table (`requireAssetsOf`); a missing one is `null`/`undefined` and is skipped.
 *
 *  Example: `await requireAssetsOf(daos, campaignId, lookAssetIdsOf(command.style))` */
export function lookAssetIdsOf(
  look: Readonly<{ imageAssetId?: string | null; aura?: TokenAuraDto | null }>,
): (string | null | undefined)[] {
  const auraImage = look.aura?.kind === 'image' ? look.aura.imageAssetId : null;
  return [look.imageAssetId, auraImage];
}

function checkedShapeOf(
  tokenId: string,
  radius: number,
  opacity: number,
): Readonly<{ radius: number; opacity: number }> {
  try {
    return { radius: auraRadius(radius), opacity: auraOpacity(opacity) };
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    throw new RangeError(`Token ${tokenId} has an invalid aura: ${why}`, { cause: error });
  }
}
