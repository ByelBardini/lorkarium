import { describe, expect, it } from 'vitest';
import { SheetItemBo } from '../../../src/modules/sheets/sheet-item.bo';
import { VHARN_ID } from '../../support/campaigns-factories';
import { ATO_1_ID, QUELM_FOLDER_ID } from '../../support/library-factories';
import { LYRA_SHEET_ID } from '../../support/sheets-fakes';

const rules = new SheetItemBo(VHARN_ID);

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

  it.each([
    ['the character name of the card', 'Lyra Rubra', 'Bia', 'Lyra Rubra', 'LR'],
    ['the nickname without a character name', null, 'Caio', 'Caio', 'CA'],
    ['the nickname when the character name is blank', '   ', 'Caio', 'Caio', 'CA'],
    ['the first letters of a name of connectives', 'de', 'Bia', 'de', 'DE'],
  ])('a new anchor takes %s', (_what, characterName, nickname, name, initials) => {
    expect(rules.anchorIdentityOf(characterName, nickname)).toEqual({
      name,
      initials,
      side: 'ally',
    });
  });

  it('a sheet held by a token names it; one nobody holds is SHEET_HAS_NO_TOKEN', () => {
    expect(rules.requireToken({ id: LYRA_SHEET_ID, tokenId: 'token-1' })).toBe('token-1');
    expect(() => rules.requireToken({ id: LYRA_SHEET_ID, tokenId: null })).toThrow(
      expect.objectContaining({
        code: 'SHEET_HAS_NO_TOKEN',
        message: `Sheet ${LYRA_SHEET_ID} has no holder; expected a sheet held by a token`,
      }),
    );
  });
});
