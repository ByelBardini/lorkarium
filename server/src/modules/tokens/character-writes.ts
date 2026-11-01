import type { ClockPort } from '../auth/clock.port';
import type { CharacterPublisherPort } from '../characters/character-publisher.port';
import type { CharacterRow } from '../characters/characters.dao';
import { toCharacterView } from '../characters/characters.mapper';
import type { CharacterLookChangesPo } from '../characters/characters.po';
import { charactersEventBase } from '../characters/locked-characters';
import { splitUpdate } from './linked-token';
import type { TokenWriteDaos } from './token-transaction';
import type { TokenRow, TokenUpdatePo } from './tokens.dao';

/** Where a token command tells the table that it changed characters (`character:changed`). */
export type CharacterChangeOutlet = Readonly<{
  publisher: CharacterPublisherPort;
  clock: ClockPort;
}>;

/** A `token:update` of a linked token, written where each part lives: the identity, look, aura,
 *  bars and controllers on its character, the size, sight, light and forms on the token. The
 *  update already carries the form the token keeps (`activeFormId`).
 *
 *  Example: `await updateLinkedToken(daos, lyraOfEstrada, lyra, update)` */
export async function updateLinkedToken(
  daos: TokenWriteDaos,
  found: TokenRow,
  character: CharacterRow,
  update: TokenUpdatePo,
): Promise<void> {
  const { shared, own } = splitUpdate(update);
  const characterId = character.character.id;
  await daos.characters.update(characterId, shared.look);
  await daos.characters.replaceBars(characterId, shared.bars);
  await daos.characters.replaceControllers(characterId, shared.controllerIds);
  await daos.tokens.updateFields(found.token.id, own.fields, own.forms);
}

/** The same look on each listed character, and the characters as saved after it (in the order
 *  the table keeps them). Nothing listed writes and reads nothing.
 *
 *  Example: `const changed = await restyleCharacters(daos, vharnId, [lyraId], { defeated: true })` */
export async function restyleCharacters(
  daos: TokenWriteDaos,
  campaignId: string,
  characterIds: readonly string[],
  look: CharacterLookChangesPo,
): Promise<CharacterRow[]> {
  const unique = [...new Set(characterIds)];
  if (unique.length === 0) return [];
  for (const characterId of unique) await daos.characters.update(characterId, look);
  return daos.characters.findManyInCampaign(campaignId, unique);
}

/** One `character:changed` with every character the command changed, in the characters'
 *  version it saved, after the commit (spec §5.5). No character, no event.
 *
 *  Example: `publishCharactersChange(outlet, campaignId, saved.characters, [lyra])` */
export function publishCharactersChange(
  outlet: CharacterChangeOutlet,
  campaignId: string,
  version: number | null,
  rows: readonly CharacterRow[],
): void {
  if (version === null || rows.length === 0) return;
  const base = charactersEventBase(campaignId, version, outlet.clock);
  outlet.publisher.charactersChanged({ ...base, characters: rows.map(toCharacterView) });
}
