import type { CharacterDto, TokenDto } from '@lorkarium/contracts';

/** The token of the grid linked to `character`, if any (a character has at most one per grid).
 *
 *  Example: `characterTokenOf(board.tokens, lyraCharacter)?.id // 'lyra-id'` */
export function characterTokenOf<T extends Pick<TokenDto, 'characterId'>>(
  tokens: readonly T[],
  character: Pick<CharacterDto, 'id'> | null,
): T | null {
  if (!character) return null;
  return tokens.find(({ characterId }) => characterId === character.id) ?? null;
}

/** The token the viewer's dock shows when nothing is selected: the token of their character in
 *  this grid; `null` with no character (a master) or none of it here.
 *
 *  Example: `mainTokenIdOf(board.tokens, myCharacter) // 'lyra-id' for Bia, null for Ana` */
export function mainTokenIdOf(
  tokens: readonly Pick<TokenDto, 'id' | 'characterId'>[],
  character: Pick<CharacterDto, 'id'> | null,
): string | null {
  return characterTokenOf(tokens, character)?.id ?? null;
}
