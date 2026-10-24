import { describe, expect, it } from 'vitest';
import { CharacterLinkBo } from '../../../src/modules/tokens/character-link.bo';
import { BIA_ID, VHARN_ID } from '../../support/campaigns-factories';

const rules = new CharacterLinkBo(VHARN_ID);
const LYRA = 'lyra';
const ANCHOR = 'anchor';

describe('CharacterLinkBo', () => {
  it('only a player has a card to link to: the master and a stranger are MEMBER_NOT_FOUND', () => {
    expect(() => rules.requirePlayer(BIA_ID, 'player')).not.toThrow();
    expect(() => rules.requirePlayer(BIA_ID, 'master')).toThrow(
      expect.objectContaining({
        code: 'MEMBER_NOT_FOUND',
        message: expect.stringContaining(BIA_ID),
      }),
    );
    expect(() => rules.requirePlayer(BIA_ID, null)).toThrow(
      expect.objectContaining({ code: 'MEMBER_NOT_FOUND' }),
    );
  });

  it('a token already a character, or a grid already holding the character, is CHARACTER_ALREADY_PLACED', () => {
    expect(() => rules.requireFree({ id: LYRA, anchorTokenId: null })).not.toThrow();
    expect(() => rules.requireFree({ id: LYRA, anchorTokenId: ANCHOR })).toThrow(
      expect.objectContaining({ code: 'CHARACTER_ALREADY_PLACED' }),
    );
    expect(() => rules.requireNotPlaced('kael', BIA_ID, undefined)).not.toThrow();
    expect(() => rules.requireNotPlaced('kael', BIA_ID, { id: LYRA })).toThrow(
      expect.objectContaining({ message: expect.stringMatching(/kael.*lyra/) }),
    );
  });

  it('unlinking names the anchor, and an unlinked token is TOKEN_NOT_LINKED', () => {
    expect(rules.anchorOf({ id: LYRA, anchorTokenId: ANCHOR })).toBe(ANCHOR);
    expect(() => rules.anchorOf({ id: LYRA, anchorTokenId: null })).toThrow(
      expect.objectContaining({ code: 'TOKEN_NOT_LINKED' }),
    );
  });
});
