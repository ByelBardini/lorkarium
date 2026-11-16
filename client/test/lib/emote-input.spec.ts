import { describe, expect, it } from 'vitest';
import { MEMES } from '@/lib/emote-catalog';
import {
  EMOTE_SUGGESTION_LIMIT,
  searchEmotes,
  suggestEmotes,
  withEmoteCode,
} from '@/lib/emote-input';

describe('suggestEmotes', () => {
  it('offers the :name: code that starts with what was typed', () => {
    expect(suggestEmotes('tro').map((each) => each.code)).toEqual([':trollface:']);
    expect(suggestEmotes('godw').map((each) => each.code)).toEqual([':godwhy:']);
  });

  it('finds by a pt-BR keyword without accent or case, offering the first :name:', () => {
    expect(suggestEmotes('CORAÇ').map((each) => each.code)).toEqual([':heart:']);
  });

  it('keeps the catalog order, smileys before memes, within the limit', () => {
    const found = suggestEmotes('p');
    expect(found.map((each) => each.code)).toEqual([
      ':wink:',
      ':pacman:',
      ':poop:',
      ':pokerface:',
      ':pikachu:',
    ]);
    expect(found.length).toBeLessThanOrEqual(EMOTE_SUGGESTION_LIMIT);
  });

  it('offers nothing for a word no emote starts with', () => {
    expect(suggestEmotes('zzz')).toEqual([]);
  });
});

describe('searchEmotes', () => {
  it('keeps the emotes with any code or keyword containing the search', () => {
    expect(searchEmotes(MEMES, 'god').map((emote) => emote.id)).toEqual(['ohgodwhy']);
  });

  it('a blank search keeps them all', () => {
    expect(searchEmotes(MEMES, '  ')).toHaveLength(MEMES.length);
  });
});

describe('withEmoteCode', () => {
  it('writes the code at the caret with a space after it', () => {
    expect(withEmoteCode('oi  bia', 3, ':doge:')).toEqual({ draft: 'oi :doge:  bia', caret: 10 });
  });

  it('puts a space before when glued to a word, none in an empty field', () => {
    expect(withEmoteCode('oi', 2, ':doge:')).toEqual({ draft: 'oi :doge: ', caret: 10 });
    expect(withEmoteCode('', 0, ':)')).toEqual({ draft: ':) ', caret: 3 });
  });
});
