import type { CharacterRow, CharactersDao } from '../characters/characters.dao';
import { lockCharacters, savedVersionOf } from '../characters/locked-characters';
import { SheetItemBo, type CharacterMainRef } from './sheet-item.bo';

/** What keeping the main sheets reads and writes, on the sheet's transaction. */
export type MainSheetDaos = Readonly<{
  characters: Pick<
    CharactersDao,
    'lockVersion' | 'bumpVersion' | 'findManyInCampaign' | 'setMainSheet'
  >;
}>;

/** The characters whose main sheet changed, saved in one version of the table's characters. */
export type SavedMainSheets = Readonly<{ version: number; rows: readonly CharacterRow[] }>;

/** Which character held a sheet before a write and which holds it after (`null` = none). */
export type SheetHolderMove = Readonly<{ from: string | null; to: string | null }>;

/** Keeps the main sheets right as `sheetId` moves between characters: the first sheet a character
 *  gets becomes its main one, the main one leaving makes it have none. Runs inside the sheet's
 *  transaction (the table already locked), locking the characters before reading them; `null`
 *  when no main sheet changed (no version is spent).
 *
 *  Example: `const saved = await keepMainSheet(daos, vharnId, sheet.id, { from: null, to: kaelId })` */
export async function keepMainSheet(
  daos: MainSheetDaos,
  campaignId: string,
  sheetId: string,
  move: SheetHolderMove,
): Promise<SavedMainSheets | null> {
  const ids = [move.from, move.to].flatMap((id) => (id ? [id] : []));
  if (ids.length === 0 || move.from === move.to) return null;
  const locked = await lockCharacters(daos, campaignId);
  const rows = await daos.characters.findManyInCampaign(campaignId, ids);
  const rules = new SheetItemBo(campaignId);
  const writes = rules.mainSheetWritesOf(sheetId, mainOf(rows, move.from), mainOf(rows, move.to));
  if (writes.length === 0) return null;
  for (const write of writes)
    await daos.characters.setMainSheet(write.characterId, write.mainSheetId);
  const version = await savedVersionOf(locked, true);
  const changedIds = writes.map(({ characterId }) => characterId);
  return { version, rows: await daos.characters.findManyInCampaign(campaignId, changedIds) };
}

function mainOf(
  rows: readonly CharacterRow[],
  characterId: string | null,
): CharacterMainRef | null {
  const row = rows.find(({ character }) => character.id === characterId);
  return row ? { characterId: row.character.id, mainSheetId: row.character.mainSheetId } : null;
}
