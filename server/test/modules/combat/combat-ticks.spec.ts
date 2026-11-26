import { describe, expect, it } from 'vitest';
import { holdersOf, holdersToTick } from '../../../src/modules/combat/combat-ticks';

const tokens = [
  { tokenId: 'kael', controllerIds: [], characterId: null, hidden: false },
  { tokenId: 'lyra', controllerIds: [], characterId: 'char-lyra', hidden: false },
  { tokenId: 'lyra-torre', controllerIds: [], characterId: 'char-lyra', hidden: false },
];

describe('holdersOf', () => {
  it('a loose token holds its own conditions; linked tokens hold their character once', () => {
    expect(holdersOf(tokens, ['kael', 'lyra', 'lyra-torre'])).toEqual({
      loose: ['kael'],
      characterIds: ['char-lyra'],
    });
  });

  it('a token not on the grid is taken as loose', () => {
    expect(holdersOf(tokens, ['ghost']).loose).toEqual(['ghost']);
  });
});

describe('holdersToTick', () => {
  it('the loose tokens come first, then the characters', () => {
    expect(holdersToTick(['kael'], ['char-lyra'])).toEqual([
      { tokenId: 'kael' },
      { characterId: 'char-lyra' },
    ]);
  });
});
