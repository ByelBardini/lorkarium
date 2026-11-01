import { describe, expect, it } from 'vitest';
import { characterTokenOf, mainTokenIdOf } from '@/lib/main-token';
import {
  kaelCharacter,
  linkedKael,
  linkedLyra,
  lyraCharacter,
} from '../support/character-fixtures';
import { KAEL_ID, LYRA_ID, kael, lyra } from '../support/table-session-fixtures';

describe('mainTokenIdOf', () => {
  it("is the token of the viewer's character in this grid", () => {
    const tokens = [linkedKael(), linkedLyra()];
    expect(mainTokenIdOf(tokens, lyraCharacter())).toBe(LYRA_ID);
    expect(mainTokenIdOf(tokens, kaelCharacter())).toBe(KAEL_ID);
  });

  it('a free token listing the viewer in its control is not their main one', () => {
    expect(mainTokenIdOf([lyra(), kael()], lyraCharacter())).toBeNull();
  });

  it('no character (a master) or no token of it in this grid: none', () => {
    expect(mainTokenIdOf([linkedLyra()], null)).toBeNull();
    expect(mainTokenIdOf([linkedKael()], lyraCharacter())).toBeNull();
  });
});

describe('characterTokenOf', () => {
  it('gives back the token itself, so its place and sight come with it', () => {
    const own = linkedLyra({ col: 9 });
    expect(characterTokenOf([linkedKael(), own], lyraCharacter())).toBe(own);
    expect(characterTokenOf([own], null)).toBeNull();
  });
});
