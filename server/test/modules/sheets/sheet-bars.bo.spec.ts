import { describe, expect, it } from 'vitest';
import { spentBarWritesOf } from '../../../src/modules/sheets/sheet-bars.bo';

const MP_ID = '00000000-0000-4000-8000-0000000000a1';
const EF_ID = '00000000-0000-4000-8000-0000000000a2';
const OTHER_ID = '00000000-0000-4000-8000-0000000000a3';
const MP = { id: MP_ID, label: 'MP', current: 10, max: 10, temp: 0 };
const EF = { id: EF_ID, label: 'EF', current: 5, max: 8, temp: 2 };
const LYRA = { characterId: '00000000-0000-4000-8000-0000000000c1' };
const BRAM = { tokenId: '00000000-0000-4000-8000-0000000000t1' };

describe('spentBarWritesOf', () => {
  it('writes the new values of each bar that paid, temp and max kept', () =>
    expect(
      spentBarWritesOf(
        LYRA,
        [MP, EF],
        [
          { barId: MP_ID, amount: 6 },
          { barId: EF_ID, amount: 5 },
        ],
      ),
    ).toEqual([
      { barId: MP_ID, values: { current: 4, max: 10, temp: 0 } },
      { barId: EF_ID, values: { current: 0, max: 8, temp: 2 } },
    ]));

  it('one bar short is INSUFFICIENT_BAR citing its label, balance and cost', () =>
    expect(() =>
      spentBarWritesOf(
        LYRA,
        [MP, EF],
        [
          { barId: MP_ID, amount: 6 },
          { barId: EF_ID, amount: 6 },
        ],
      ),
    ).toThrow(
      expect.objectContaining({
        code: 'INSUFFICIENT_BAR',
        message: 'Bar "EF" has 5; expected at least 6',
      }),
    ));

  it("a bar that is not the character's is BAR_NOT_FOUND citing the character and the bar", () =>
    expect(() => spentBarWritesOf(LYRA, [MP], [{ barId: OTHER_ID, amount: 1 }])).toThrow(
      expect.objectContaining({
        code: 'BAR_NOT_FOUND',
        message: `character ${LYRA.characterId} has no bar ${OTHER_ID}`,
      }),
    ));

  it("a bar that is not the token's is BAR_NOT_FOUND citing the token and the bar", () =>
    expect(() => spentBarWritesOf(BRAM, [MP], [{ barId: OTHER_ID, amount: 1 }])).toThrow(
      expect.objectContaining({
        code: 'BAR_NOT_FOUND',
        message: `token ${BRAM.tokenId} has no bar ${OTHER_ID}`,
      }),
    ));

  it('a missing bar is refused before any balance is checked', () =>
    expect(() =>
      spentBarWritesOf(
        LYRA,
        [MP],
        [
          { barId: MP_ID, amount: 50 },
          { barId: OTHER_ID, amount: 1 },
        ],
      ),
    ).toThrow(expect.objectContaining({ code: 'BAR_NOT_FOUND' })));
});
