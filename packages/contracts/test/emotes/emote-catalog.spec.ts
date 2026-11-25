import { describe, expect, it } from 'vitest';
import {
  EMOTE_CATEGORIES,
  EMOTES,
  MEMES,
  SMILEYS,
  emoteOfUnicode,
  isCatalogEmoteName,
  isNamedEmoteCode,
} from '../../src/emotes/emote-catalog';

const VARIATION_SELECTOR = '\u{FE0F}';

function emoteById(id: string) {
  return EMOTES.find((emote) => emote.id === id);
}

describe('emote catalog', () => {
  it('keeps only the chosen memes, plus chad, stonks and the three drawn for the project', () => {
    expect(MEMES.map((emote) => emote.id)).toEqual([
      'okayface',
      'vish',
      'yaoming',
      'huehue',
      'dinofauro',
      'doge',
      'chad',
      'stonks',
      'nat20',
      'nat1',
      'mimic',
    ]);
  });

  it('drops the memes the user took out, so :megusta: is plain text again', () => {
    const codes = EMOTES.flatMap((emote) => emote.codes);
    for (const code of [':megusta:', ':rage:', ':lol:', ':wtf:', ':gold:']) {
      expect(codes).not.toContain(code);
    }
  });

  it('leaves out the pictures whose owners enforce them (Pikachu, Pac-Man, Trollface)', () => {
    const ids = EMOTES.map((emote) => emote.id);
    for (const id of ['pikachu', 'pacman', 'trollface']) expect(ids).not.toContain(id);
  });

  it('has the old 24 smileys and the 107 Noto emojis the user picked', () => {
    expect(SMILEYS).toHaveLength(131);
    expect(emoteById('joy')).toMatchObject({ category: 'reactions', unicode: '😂' });
    expect(emoteById('dice')).toMatchObject({ category: 'rpg', unicode: '🎲' });
    expect(emoteById('see_no_evil')).toMatchObject({ category: 'monkeys', unicode: '🙈' });
    expect(emoteById('thumbs-up')).toMatchObject({ category: 'gestures', unicode: '👍' });
  });

  it('gives the old smileys the character of their Noto picture', () => {
    expect(emoteById('smile')?.unicode).toBe('😊');
    expect(emoteById('giggle')?.unicode).toBe('🤭');
    expect(emoteById('heart')?.unicode).toBe('❤');
  });

  it('never gives one code (or one :name: in any case) to two emotes', () => {
    const codes = EMOTES.flatMap((emote) =>
      emote.codes.map((code) => (isNamedEmoteCode(code) ? code.toLowerCase() : code)),
    );
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('never repeats a character, and keeps every one without the variation selector', () => {
    const characters = EMOTES.flatMap((emote) => (emote.unicode === null ? [] : [emote.unicode]));
    expect(new Set(characters).size).toBe(characters.length);
    for (const character of characters) expect(character).not.toContain(VARIATION_SELECTOR);
  });

  it('never repeats an id, and gives every emote a :name: code and a known category', () => {
    expect(new Set(EMOTES.map((emote) => emote.id)).size).toBe(EMOTES.length);
    for (const emote of EMOTES) {
      expect(emote.codes.some(isNamedEmoteCode)).toBe(true);
      expect(EMOTE_CATEGORIES).toContain(emote.category);
    }
  });

  it('puts every meme in the memes tab and no smiley there', () => {
    for (const emote of EMOTES) expect(emote.category === 'memes').toBe(emote.kind === 'meme');
  });
});

describe('isNamedEmoteCode', () => {
  it('is true for :name:, false for a text smiley or a bare colon pair', () => {
    expect(isNamedEmoteCode(':serio?:')).toBe(true);
    expect(isNamedEmoteCode(':)')).toBe(false);
    expect(isNamedEmoteCode('::')).toBe(false);
    expect(isNamedEmoteCode(':a b:')).toBe(false);
  });
});

describe('isCatalogEmoteName', () => {
  it('is true for a :name: of the catalog, in any case', () => {
    expect(isCatalogEmoteName('doge')).toBe(true);
    expect(isCatalogEmoteName('Doge')).toBe(true);
    expect(isCatalogEmoteName('smile')).toBe(true);
  });

  it('is false for a name nobody in the catalog has', () => {
    expect(isCatalogEmoteName('teste')).toBe(false);
    expect(isCatalogEmoteName('megusta')).toBe(false);
  });
});

describe('emoteOfUnicode', () => {
  it('finds the emote of a character, with or without the variation selector', () => {
    expect(emoteOfUnicode('⚔')?.id).toBe('crossed_swords');
    expect(emoteOfUnicode(`⚔${VARIATION_SELECTOR}`)?.id).toBe('crossed_swords');
  });

  it('is null for a character the catalog does not draw', () => {
    expect(emoteOfUnicode('🫃')).toBeNull();
  });
});
