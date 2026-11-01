import { describe, expect, it } from 'vitest';
import { isSpareSheet } from '@/lib/sheet-holder';
import { BIA_AT_TABLE, LYRA_ID } from '../support/table-session-fixtures';

describe('isSpareSheet', () => {
  it.each([
    ['no token and no player', { tokenId: null, memberId: null }, true],
    [
      "a character's (its player, no token)",
      { tokenId: null, memberId: BIA_AT_TABLE.userId },
      false,
    ],
    ["a loose token's", { tokenId: LYRA_ID, memberId: null }, false],
  ])('a sheet with %s is spare: %s', (_case, holder, spare) => {
    expect(isSpareSheet(holder)).toBe(spare);
  });
});
