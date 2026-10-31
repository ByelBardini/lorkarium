import { describe, expect, it } from 'vitest';
import { characterAnchorOf } from '@/lib/character-anchor';
import { LYRA_ANCHOR_ID, linkedLyra, lyraAnchor } from '../support/cast-fixtures';
import { kael } from '../support/table-session-fixtures';

describe('characterAnchorOf', () => {
  it("is the card's anchor, also when the card says there is none", () => {
    expect(characterAnchorOf({ anchorTokenId: LYRA_ANCHOR_ID }, kael())).toBe(LYRA_ANCHOR_ID);
    expect(characterAnchorOf({ anchorTokenId: null }, linkedLyra())).toBeNull();
  });

  it("without it on the card: the main token's anchor, or the token that is the anchor", () => {
    expect(characterAnchorOf({}, linkedLyra())).toBe(LYRA_ANCHOR_ID);
    expect(characterAnchorOf({}, lyraAnchor())).toBe(LYRA_ANCHOR_ID);
    expect(characterAnchorOf({}, null)).toBeNull();
  });
});
