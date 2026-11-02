import type { CharacterDto, TokenDto } from '@lorkarium/contracts';

/** A character a free token can be linked to; `placed` when this grid already has a token of it
 *  (the server refuses a second: `CHARACTER_ALREADY_PLACED`). */
export type CharacterLinkTarget = Readonly<{
  characterId: string;
  name: string;
  placed: boolean;
}>;

/** The table's characters, in the server's order, each with whether `tokens` (the grid's) already
 *  holds one of it. The master's "Ligar a personagem…".
 *
 *  Example: `characterLinkTargetsOf(characters, board.tokens) // [{ characterId, name: 'Lyra', placed: true }]` */
export function characterLinkTargetsOf(
  characters: readonly CharacterDto[],
  tokens: readonly Pick<TokenDto, 'characterId'>[],
): CharacterLinkTarget[] {
  const placed = new Set(tokens.map(({ characterId }) => characterId));
  return characters.map(({ id, name }) => ({ characterId: id, name, placed: placed.has(id) }));
}

/** The character `token` is linked to, or `null` for a free token (or one not known yet).
 *
 *  Example: `linkedCharacterOf(linkedLyra, characters)?.name // 'Lyra'` */
export function linkedCharacterOf(
  token: Pick<TokenDto, 'characterId'>,
  characters: readonly CharacterDto[],
): CharacterDto | null {
  if (!token.characterId) return null;
  return characters.find(({ id }) => id === token.characterId) ?? null;
}
