import { describe, expect, it } from 'vitest';
import {
  activeEmojiIdsOf,
  customEmojiNamesIn,
  customEmojiRefsIn,
} from '../../../src/modules/custom-emojis/custom-emoji.bo';

// Passed in like the service does; written by hand so the spec does not echo the contract.
const RULES = { pattern: /^[a-z0-9_]{2,32}$/u, perMessage: 20 };

type Row = Readonly<{ id: string; name: string; createdAt: Date }>;

function row(id: string, name: string, minute: number): Row {
  return { id, name, createdAt: new Date(Date.UTC(2026, 10, 24, 12, minute)) };
}

describe('activeEmojiIdsOf', () => {
  it('keeps the oldest up to the ceiling, by creation then id', () => {
    const rows = [
      row('c', 'tres', 2),
      row('b', 'dois', 1),
      row('a', 'um', 1),
      row('d', 'quatro', 3),
    ];
    expect([...activeEmojiIdsOf(rows, 3)]).toEqual(['a', 'b', 'c']);
  });

  it('keeps every one without a ceiling, none with a ceiling of 0', () => {
    const rows = [row('a', 'um', 1), row('b', 'dois', 2)];
    expect([...activeEmojiIdsOf(rows, null)]).toEqual(['a', 'b']);
    expect([...activeEmojiIdsOf(rows, 0)]).toEqual([]);
  });
});

describe('customEmojiNamesIn', () => {
  it('finds each :name: once, lower-cased, in the order of the text', () => {
    expect(customEmojiNamesIn('oi :Festa: e :bolo: de novo :festa:', RULES)).toEqual([
      'festa',
      'bolo',
    ]);
  });

  it('skips what is not a name: one letter, a space, an accent', () => {
    expect(customEmojiNamesIn(':a: :com espaco: :ação:', RULES)).toEqual([]);
  });

  it('stops at 20 names', () => {
    const text = Array.from({ length: 25 }, (_, at) => `:nome${at}:`).join(' ');
    expect(customEmojiNamesIn(text, RULES)).toHaveLength(20);
    expect(customEmojiNamesIn(text, RULES)[19]).toBe('nome19');
  });
});

describe('customEmojiRefsIn', () => {
  const active = [
    { id: 'e1', name: 'festa' },
    { id: 'e2', name: 'bolo' },
  ];

  it('gives the active emojis the text names, in the order of the text', () => {
    expect(customEmojiRefsIn('bora :bolo: :festa:', active, RULES)).toEqual([
      { name: 'bolo', emojiId: 'e2' },
      { name: 'festa', emojiId: 'e1' },
    ]);
  });

  it('leaves out a name the sender has no active emoji for', () => {
    expect(customEmojiRefsIn(':festa: :doge: :outro:', active, RULES)).toEqual([
      { name: 'festa', emojiId: 'e1' },
    ]);
  });

  it('gives nothing for a text without codes', () => {
    expect(customEmojiRefsIn('só texto', active, RULES)).toEqual([]);
  });
});
