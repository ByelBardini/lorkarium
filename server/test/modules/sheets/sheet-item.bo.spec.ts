import { describe, expect, it } from 'vitest';
import { SheetItemBo } from '../../../src/modules/sheets/sheet-item.bo';
import { BIA_ID, VHARN_ID } from '../../support/campaigns-factories';
import { LYRA_CHARACTER_ID } from '../../support/characters-factories';
import { ATO_1_ID, QUELM_FOLDER_ID } from '../../support/library-factories';
import {
  KAEL_CHARACTER_ID,
  LYRA_SHEET_ID,
  QUELM_SHEET_ID,
  lyraPlace,
  tablePlaces,
} from '../../support/sheets-fakes';

const rules = new SheetItemBo(VHARN_ID);
const LYRA_MAIN = { characterId: LYRA_CHARACTER_ID, mainSheetId: LYRA_SHEET_ID };
const KAEL_NONE = { characterId: KAEL_CHARACTER_ID, mainSheetId: null };

describe('SheetItemBo', () => {
  it.each([
    ['the root', null],
    ['Ato 1', ATO_1_ID],
  ])('a sheet goes to %s', (_where, folderId) => {
    expect(rules.requireFolder([ATO_1_ID], folderId)).toBeUndefined();
  });

  it('the folder of Quelm is FOLDER_NOT_FOUND, citing it', () => {
    expect(() => rules.requireFolder([ATO_1_ID], QUELM_FOLDER_ID)).toThrow(
      expect.objectContaining({
        code: 'FOLDER_NOT_FOUND',
        message: expect.stringContaining(QUELM_FOLDER_ID),
      }),
    );
  });

  it('a token of a grid of the table holds sheets; none found is TOKEN_NOT_FOUND citing it', () => {
    const [lyra] = tablePlaces();

    expect(rules.requireGridToken('lyra', lyra)).toBe(lyra);
    expect(() => rules.requireGridToken('gone', undefined)).toThrow(
      expect.objectContaining({
        code: 'TOKEN_NOT_FOUND',
        message: expect.stringContaining('gone'),
      }),
    );
  });

  it('a player, or a master who kept theirs, has a character; a stored one or none is MEMBER_NOT_FOUND', () => {
    const master = lyraPlace({ holderRole: 'master' });

    expect(rules.requirePlayerCharacter(BIA_ID, lyraPlace())).toEqual(lyraPlace());
    expect(rules.requirePlayerCharacter(BIA_ID, master)).toBe(master);
    for (const character of [lyraPlace({ holderRole: 'spectator' }), undefined]) {
      expect(() => rules.requirePlayerCharacter(BIA_ID, character)).toThrow(
        expect.objectContaining({
          code: 'MEMBER_NOT_FOUND',
          message: expect.stringContaining(BIA_ID),
        }),
      );
    }
  });

  it('a held sheet names its token or its character; one nobody holds is SHEET_HAS_NO_TOKEN', () => {
    const sheet = { id: LYRA_SHEET_ID, tokenId: null, characterId: null };

    expect(rules.requireHolder({ ...sheet, tokenId: 'token-1' })).toEqual({ tokenId: 'token-1' });
    expect(rules.requireHolder({ ...sheet, characterId: LYRA_CHARACTER_ID })).toEqual({
      characterId: LYRA_CHARACTER_ID,
    });
    expect(() => rules.requireHolder(sheet)).toThrow(
      expect.objectContaining({
        code: 'SHEET_HAS_NO_TOKEN',
        message: `Sheet ${LYRA_SHEET_ID} has no holder; expected a sheet held by a token or a character`,
      }),
    );
  });

  describe('main sheets', () => {
    it("a character's first sheet becomes its main one", () => {
      expect(rules.mainSheetWritesOf(QUELM_SHEET_ID, null, KAEL_NONE)).toEqual([
        { characterId: KAEL_CHARACTER_ID, mainSheetId: QUELM_SHEET_ID },
      ]);
    });

    it('a second sheet does not take the place of the main one', () => {
      expect(rules.mainSheetWritesOf(QUELM_SHEET_ID, null, LYRA_MAIN)).toEqual([]);
    });

    it('the main sheet leaving its character leaves it with none, and the new one gets it', () => {
      expect(rules.mainSheetWritesOf(LYRA_SHEET_ID, LYRA_MAIN, KAEL_NONE)).toEqual([
        { characterId: LYRA_CHARACTER_ID, mainSheetId: null },
        { characterId: KAEL_CHARACTER_ID, mainSheetId: LYRA_SHEET_ID },
      ]);
      expect(rules.mainSheetWritesOf(LYRA_SHEET_ID, LYRA_MAIN, null)).toEqual([
        { characterId: LYRA_CHARACTER_ID, mainSheetId: null },
      ]);
    });

    it('another sheet leaving keeps the main one; the same character on both ends writes nothing', () => {
      expect(rules.mainSheetWritesOf(QUELM_SHEET_ID, LYRA_MAIN, null)).toEqual([]);
      expect(rules.mainSheetWritesOf(LYRA_SHEET_ID, LYRA_MAIN, LYRA_MAIN)).toEqual([]);
      expect(rules.mainSheetWritesOf(LYRA_SHEET_ID, null, null)).toEqual([]);
    });
  });
});
