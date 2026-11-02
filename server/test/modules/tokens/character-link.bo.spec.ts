import { describe, expect, it } from 'vitest';
import { CharacterLinkBo } from '../../../src/modules/tokens/character-link.bo';

const rules = new CharacterLinkBo();
const KAEL = 'kael';
const LYRA_TOKEN = 'lyra-token';
const LYRA = 'lyra-character';

describe('CharacterLinkBo', () => {
  it('a token that already wears a character is CHARACTER_ALREADY_PLACED, citing it', () => {
    expect(() => rules.requireFree({ id: KAEL, characterId: null })).not.toThrow();
    expect(() => rules.requireFree({ id: LYRA_TOKEN, characterId: LYRA })).toThrow(
      expect.objectContaining({
        code: 'CHARACTER_ALREADY_PLACED',
        message: expect.stringMatching(/lyra-token already wears character lyra-character/),
      }),
    );
  });

  it('a grid already holding a token of the character is CHARACTER_ALREADY_PLACED, citing both tokens', () => {
    expect(() => rules.requireNotPlaced(KAEL, LYRA, undefined)).not.toThrow();
    expect(() => rules.requireNotPlaced(KAEL, LYRA, { id: LYRA_TOKEN })).toThrow(
      expect.objectContaining({
        code: 'CHARACTER_ALREADY_PLACED',
        message: expect.stringMatching(
          /kael cannot wear character lyra-character: token lyra-token/,
        ),
      }),
    );
  });

  it('unlinking names the character worn, and an unlinked token is TOKEN_NOT_LINKED', () => {
    expect(rules.linkedOf({ id: LYRA_TOKEN, characterId: LYRA })).toBe(LYRA);
    expect(() => rules.linkedOf({ id: KAEL, characterId: null })).toThrow(
      expect.objectContaining({ code: 'TOKEN_NOT_LINKED', message: expect.stringContaining(KAEL) }),
    );
  });
});
