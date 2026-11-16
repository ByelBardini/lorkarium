import { describe, expect, it } from 'vitest';
import { EMOTES, MEMES, SMILEYS, isNamedEmoteCode } from '@/lib/emote-catalog';

describe('emote catalog', () => {
  it('has 25 smileys and 22 memes, the star left out', () => {
    expect(SMILEYS).toHaveLength(25);
    expect(MEMES).toHaveLength(22);
    expect(EMOTES.flatMap((emote) => emote.codes)).not.toContain(':gold:');
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
