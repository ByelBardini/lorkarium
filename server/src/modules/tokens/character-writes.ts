import type { BarAdjustment } from '@lorkarium/game-core';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { CharacterPublisherPort } from '../characters/character-publisher.port';
import type { CharacterRow } from '../characters/characters.dao';
import { toCharacterBo, toCharacterView } from '../characters/characters.mapper';
import type { CharacterLookChangesPo } from '../characters/characters.po';
import { charactersEventBase } from '../characters/locked-characters';
import { characterIn, splitUpdate } from './linked-token';
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

/** A bar of the character behind an anchor of the cast (a sheet still held by the anchor), by the
 *  character's rule: the one of the card's player that points at the anchor. `null` when no card
 *  points at it or its player has no character (the anchor keeps its own bars then).
 *
 *  Example: `const lyra = await adjustCharacterOfAnchor(daos, access, { tokenId: anchorId, barId, change }, BAR_VALUE_LIMIT)` */
export async function adjustCharacterOfAnchor(
  daos: TokenWriteDaos,
  access: CampaignAccessBo,
  bar: Readonly<{ tokenId: string; barId: string; change: BarAdjustment }>,
  barLimit: number,
): Promise<CharacterRow | null> {
  const campaignId = access.campaignIdOf();
  const cards = await daos.memberCards.listOfCampaign(campaignId);
  const card = cards.find(({ anchorTokenId }) => anchorTokenId === bar.tokenId);
  const character = card && (await daos.characters.findOfUser(campaignId, card.userId));
  if (!character) return null;
  const bo = toCharacterBo(access, character);
  const values = bo.adjustBar(character.bars, bar.barId, bar.change, barLimit);
  await daos.characters.setBarValues(bar.barId, values);
  return characterIn(daos, campaignId, character.character.id);
}
