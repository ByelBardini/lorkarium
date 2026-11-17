import { describe, expect, it } from 'vitest';
import { EMOTES, MEMES, SMILEYS, isNamedEmoteCode } from '@/lib/emote-catalog';

describe('emote catalog', () => {
  it('has 24 smileys and 20 memes, the star left out', () => {
    expect(SMILEYS).toHaveLength(24);
    expect(MEMES).toHaveLength(20);
    expect(EMOTES.flatMap((emote) => emote.codes)).not.toContain(':gold:');
  });

  it('leaves out the pictures whose owners enforce them (Pikachu, Pac-Man, Trollface)', () => {
    const ids = EMOTES.map((emote) => emote.id);
    for (const id of ['pikachu', 'pacman', 'trollface']) expect(ids).not.toContain(id);
  });

  it('never gives one code (or one :name: in any case) to two emotes', () => {
    const codes = EMOTES.flatMap((emote) =>
      emote.codes.map((code) => (isNamedEmoteCode(code) ? code.toLowerCase() : code)),
    );
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('never repeats an id, and gives every emote a :name: code for the `:` list', () => {
    expect(new Set(EMOTES.map((emote) => emote.id)).size).toBe(EMOTES.length);
    for (const emote of EMOTES) expect(emote.codes.some(isNamedEmoteCode)).toBe(true);
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
