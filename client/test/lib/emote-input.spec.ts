import { describe, expect, it } from 'vitest';
import { MEMES } from '@lorkarium/contracts';
import {
  EMOTE_SUGGESTION_LIMIT,
  searchEmotes,
  suggestCustomEmojis,
  suggestEmotes,
  withEmoteCode,
} from '@/lib/emote-input';

describe('suggestEmotes', () => {
  it('offers the :name: code that starts with what was typed', () => {
    expect(suggestEmotes('dog').map((each) => each.code)).toEqual([':doge:']);
    expect(suggestEmotes('ston').map((each) => each.code)).toEqual([':stonks:']);
  });

  it('finds by a pt-BR keyword without accent or case, offering the first :name:', () => {
    expect(suggestEmotes('CORAÇÃO PA').map((each) => each.code)).toEqual([':broken_heart:']);
  });

  it('keeps the catalog order and stops at the limit', () => {
    const found = suggestEmotes('p');
    expect(found.map((each) => each.code)).toEqual([
      ':wink:',
      ':poop:',
      ':thinking:',
      ':pleading:',
      ':partying:',
      ':skull_crossbones:',
      ':clown:',
      ':clap:',
    ]);
    expect(found).toHaveLength(EMOTE_SUGGESTION_LIMIT);
  });

  it('puts smileys before memes', () => {
    expect(suggestEmotes('do').map((each) => each.code)).toEqual([':sleeping:', ':doge:']);
  });

  it('offers nothing for a word no emote starts with', () => {
    expect(suggestEmotes('xyzw')).toEqual([]);
  });
});

describe('suggestCustomEmojis', () => {
  const own = [
    { id: 'e1', name: 'festa' },
    { id: 'e2', name: 'feliz_demais' },
    { id: 'e3', name: 'bolo' },
  ];

  it('offers the account’s own emojis whose name starts with what was typed, any case', () => {
    expect(suggestCustomEmojis('FE', own)).toEqual([
      { emojiId: 'e1', code: ':festa:' },
      { emojiId: 'e2', code: ':feliz_demais:' },
    ]);
  });

  it('offers nothing when none starts so', () => {
    expect(suggestCustomEmojis('xyz', own)).toEqual([]);
  });
});

describe('searchEmotes', () => {
  it('keeps the emotes with any code or keyword containing the search', () => {
    expect(searchEmotes(MEMES, 'ston').map((emote) => emote.id)).toEqual(['stonks']);
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
