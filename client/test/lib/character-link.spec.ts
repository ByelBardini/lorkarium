import { describe, expect, it } from 'vitest';
import { characterLinkTargetsOf, linkedCharacterOf } from '@/lib/character-link';
import {
  KAEL_CHARACTER_ID,
  LYRA_CHARACTER_ID,
  kaelCharacter,
  linkedLyra,
  lyraCharacter,
} from '../support/character-fixtures';
import { kael } from '../support/table-session-fixtures';

describe('characterLinkTargetsOf', () => {
  const characters = [lyraCharacter(), kaelCharacter()];

  it("lists the table's characters in order, the one already in this grid marked placed", () => {
    expect(characterLinkTargetsOf(characters, [linkedLyra(), kael()])).toEqual([
      { characterId: LYRA_CHARACTER_ID, name: 'Lyra', placed: true },
      { characterId: KAEL_CHARACTER_ID, name: 'Kael', placed: false },
    ]);
  });

  it('a character nobody plays is a target too; no characters, no targets', () => {
    const orphan = lyraCharacter({ userId: null });
    expect(characterLinkTargetsOf([orphan], [])).toEqual([
      { characterId: LYRA_CHARACTER_ID, name: 'Lyra', placed: false },
    ]);
    expect(characterLinkTargetsOf([], [linkedLyra()])).toEqual([]);
  });
});

describe('linkedCharacterOf', () => {
  it('a linked token gives its character; a free one, or an unknown character, none', () => {
    const characters = [kaelCharacter(), lyraCharacter()];
    expect(linkedCharacterOf(linkedLyra(), characters)?.name).toBe('Lyra');
    expect(linkedCharacterOf(kael(), characters)).toBeNull();
    expect(linkedCharacterOf(linkedLyra(), [kaelCharacter()])).toBeNull();
  });
});
