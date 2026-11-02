import { describe, expect, it } from 'vitest';
import { holderIdOf, holderIdOfRow } from '../../../src/modules/conditions/conditions.po';

describe('the holder of a condition', () => {
  it('holderIdOf is the id of the token or of the character', () => {
    expect(holderIdOf({ tokenId: 'kael' })).toBe('kael');
    expect(holderIdOf({ characterId: 'lyra' })).toBe('lyra');
  });

  it('holderIdOfRow reads the one set and refuses a row with none, citing it', () => {
    expect(holderIdOfRow({ tokenId: null, characterId: 'lyra' })).toBe('lyra');
    expect(holderIdOfRow({ tokenId: 'kael', characterId: null })).toBe('kael');
    expect(() => holderIdOfRow({ tokenId: null, characterId: null })).toThrow(
      'active condition with no holder: {"tokenId":null,"characterId":null}',
    );
  });
});
