import { describe, expect, it } from 'vitest';
import { emotePiecesOf, emotesOnly, type EmotePiece } from '@/lib/emote-text';

function shapeOf(pieces: readonly EmotePiece[]): string[] {
  return pieces.map((piece) => {
    if (piece.kind === 'text') return `text:${piece.text}`;
    if (piece.kind === 'custom') return `custom ${piece.emojiId}:${piece.code}`;
    return `${piece.emote.id}:${piece.code}`;
  });
}

describe('emotePiecesOf', () => {
  it('cuts a smiley and a meme out of the text, keeping the code as typed', () => {
    expect(shapeOf(emotePiecesOf('oi :) rolem :doge:'))).toEqual([
      'text:oi ',
      'smile::)',
      'text: rolem ',
      'doge::doge:',
    ]);
  });

  it('takes the longest code at a position (`:-D`, never `:-` and a D)', () => {
    expect(shapeOf(emotePiecesOf(':-D'))).toEqual(['grin::-D']);
  });

  it('matches a :name: code without case, a text smiley only as written', () => {
    expect(shapeOf(emotePiecesOf(':Doge:'))).toEqual(['doge::Doge:']);
    expect(shapeOf(emotePiecesOf('xd'))).toEqual(['text:xd']);
  });

  it('leaves codes glued to a word as text: times, links and a:b', () => {
    for (const text of ['às 10:30', 'http://wiki', 'a:b', 'oi:)', ':)oi', ':D:D']) {
      expect(shapeOf(emotePiecesOf(text))).toEqual([`text:${text}`]);
    }
  });

  it('takes a code before a punctuation mark or a line break', () => {
    expect(shapeOf(emotePiecesOf('fim :D!\n<3'))).toEqual([
      'text:fim ',
      'grin::D',
      'text:!\n',
      'heart:<3',
    ]);
  });

  it('gives a text without codes back whole, and nothing for an empty text', () => {
    expect(shapeOf(emotePiecesOf('sem nada aqui'))).toEqual(['text:sem nada aqui']);
    expect(emotePiecesOf('')).toEqual([]);
  });
});

describe('emotePiecesOf with a keyboard emoji', () => {
  it('draws an emoji of the catalog after a space', () => {
    expect(shapeOf(emotePiecesOf('boa 😂'))).toEqual(['text:boa ', 'joy:😂']);
  });

  it('draws it even glued to a word, unlike a text code', () => {
    expect(shapeOf(emotePiecesOf('oi😂kkk'))).toEqual(['text:oi', 'joy:😂', 'text:kkk']);
  });

  it('takes the emoji with or without the variation selector, keeping it as typed', () => {
    expect(shapeOf(emotePiecesOf('⚔'))).toEqual(['crossed_swords:⚔']);
    expect(shapeOf(emotePiecesOf('⚔\u{FE0F}!'))).toEqual(['crossed_swords:⚔\u{FE0F}', 'text:!']);
  });

  it('leaves an emoji off the catalog as text', () => {
    expect(shapeOf(emotePiecesOf('oi 🫃'))).toEqual(['text:oi 🫃']);
  });

  it('leaves as text a bigger emoji that starts with one of the catalog (joiner, skin tone)', () => {
    expect(shapeOf(emotePiecesOf('🧙\u{200D}♀'))).toEqual(['text:🧙\u{200D}♀']);
    expect(shapeOf(emotePiecesOf('👏🏽'))).toEqual(['text:👏🏽']);
  });

  it('draws two emojis side by side as a sticker', () => {
    const pieces = emotePiecesOf('😂😂');
    expect(shapeOf(pieces)).toEqual(['joy:😂', 'joy:😂']);
    expect(emotesOnly(pieces)).toBe(true);
  });
});

describe('emotePiecesOf with the custom emojis of the message', () => {
  const FESTA = [{ name: 'festa', emojiId: 'e1' }];

  it('draws a :name: the message carries, keeping the code as typed', () => {
    expect(shapeOf(emotePiecesOf('bora :Festa:!', FESTA))).toEqual([
      'text:bora ',
      'custom e1::Festa:',
      'text:!',
    ]);
  });

  it('leaves a :name: the message does not carry as text', () => {
    expect(shapeOf(emotePiecesOf(':festa:'))).toEqual(['text::festa:']);
    expect(shapeOf(emotePiecesOf(':bolo:', FESTA))).toEqual(['text::bolo:']);
  });

  it('keeps the rule of a code on its own: glued to a word it is text', () => {
    expect(shapeOf(emotePiecesOf('oi:festa:', FESTA))).toEqual(['text:oi:festa:']);
  });

  it('mixes with the catalog, and a message of only pictures is a sticker', () => {
    const pieces = emotePiecesOf(':festa: :doge:', FESTA);
    expect(shapeOf(pieces)).toEqual(['custom e1::festa:', 'text: ', 'doge::doge:']);
    expect(emotesOnly(pieces)).toBe(true);
  });
});

describe('emotesOnly', () => {
  it('is true for pictures and spaces only', () => {
    expect(emotesOnly(emotePiecesOf(':vish:  :D'))).toBe(true);
  });

  it('is false with any word, and for a blank or empty text', () => {
    expect(emotesOnly(emotePiecesOf(':vish: kkk'))).toBe(false);
    expect(emotesOnly(emotePiecesOf('   '))).toBe(false);
    expect(emotesOnly([])).toBe(false);
  });
});
