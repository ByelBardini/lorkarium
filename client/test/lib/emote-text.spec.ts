import { describe, expect, it } from 'vitest';
import { emotePiecesOf, emotesOnly, type EmotePiece } from '@/lib/emote-text';

function shapeOf(pieces: readonly EmotePiece[]): string[] {
  return pieces.map((piece) =>
    piece.kind === 'text' ? `text:${piece.text}` : `${piece.emote.id}:${piece.code}`,
  );
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
