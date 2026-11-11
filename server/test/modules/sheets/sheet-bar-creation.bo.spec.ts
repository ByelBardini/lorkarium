import { describe, expect, it } from 'vitest';
import { SheetBarCreationBo } from '../../../src/modules/sheets/sheet-bar-creation.bo';
import { LYRA_SHEET_ID } from '../../support/sheets-fakes';

const rules = new SheetBarCreationBo(LYRA_SHEET_ID, 8);
const bars = [
  { id: 'pv', label: 'PV' },
  { id: 'folego', label: 'Fôlego' },
];

describe('SheetBarCreationBo.requireDeclared', () => {
  it('lets a manifest with character:bars through', () =>
    expect(() => rules.requireDeclared(['character:stats', 'character:bars'])).not.toThrow());

  it('refuses a manifest without it, citing the sheet and the permission', () => {
    expect(() => rules.requireDeclared(['character:stats'])).toThrow(
      expect.objectContaining({
        code: 'PERMISSION_NOT_DECLARED',
        message: `Sheet ${LYRA_SHEET_ID} needs permission character:bars; expected its template manifest to declare it`,
      }),
    );
  });
});

describe('SheetBarCreationBo.barIdOf', () => {
  it('finds the bar by its label ignoring case, accents and edge spaces', () =>
    expect(rules.barIdOf(' FOLEGO ', bars, [])).toBe('folego'));

  it('a label the writes skipped is BAR_LIMIT, citing the label and the cap', () => {
    expect(() => rules.barIdOf('Sorte', bars, ['Sorte'])).toThrow(
      expect.objectContaining({
        code: 'BAR_LIMIT',
        message: 'Bar "Sorte" does not fit: the holder has 8 bars; expected fewer than 8',
      }),
    );
  });

  it('a bar missing after the writes is a broken read, not a refusal', () =>
    expect(() => rules.barIdOf('Sorte', bars, [])).toThrow(/missing on the holder/));
});
