import { describe, expect, it } from 'vitest';
import { keepMainSheet } from '../../../src/modules/sheets/main-sheet-writes';
import { VHARN_ID } from '../../support/campaigns-factories';
import { LYRA_CHARACTER_ID } from '../../support/characters-factories';
import { CharactersDaoFake } from '../../support/characters-fakes';
import {
  KAEL_CHARACTER_ID,
  LYRA_SHEET_ID,
  QUELM_SHEET_ID,
  tableCharacters,
} from '../../support/sheets-fakes';

function charactersFake(journal: string[]): CharactersDaoFake {
  return new CharactersDaoFake(journal, tableCharacters(), { [VHARN_ID]: 4 });
}

describe('keepMainSheet', () => {
  it("Kael's first sheet becomes his main one: lock, write, bump, and the saved Kael in version 5", async () => {
    const journal: string[] = [];
    const characters = charactersFake(journal);

    const saved = await keepMainSheet({ characters }, VHARN_ID, LYRA_SHEET_ID, {
      from: null,
      to: KAEL_CHARACTER_ID,
    });

    expect(journal).toEqual(['lock characters', 'main sheet', 'bump characters']);
    expect(saved?.version).toBe(5);
    expect(saved?.rows.map(({ character }) => [character.id, character.mainSheetId])).toEqual([
      [KAEL_CHARACTER_ID, LYRA_SHEET_ID],
    ]);
  });

  it('a sheet given to Lyra, who has a main one, spends no version', async () => {
    const journal: string[] = [];
    const characters = charactersFake(journal);
    await characters.setMainSheet(LYRA_CHARACTER_ID, LYRA_SHEET_ID);
    journal.length = 0;

    const move = { from: null, to: LYRA_CHARACTER_ID };
    const saved = await keepMainSheet({ characters }, VHARN_ID, QUELM_SHEET_ID, move);

    expect(saved).toBeNull();
    expect(journal).toEqual(['lock characters']);
    expect(characters.versions[VHARN_ID]).toBe(4);
  });

  it.each([
    ['no character on either end', { from: null, to: null }],
    ['the same character on both ends', { from: LYRA_CHARACTER_ID, to: LYRA_CHARACTER_ID }],
  ])('%s locks nothing and writes nothing', async (_what, move) => {
    const journal: string[] = [];

    const saved = await keepMainSheet(
      { characters: charactersFake(journal) },
      VHARN_ID,
      LYRA_SHEET_ID,
      move,
    );

    expect(saved).toBeNull();
    expect(journal).toEqual([]);
  });
});
