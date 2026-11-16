import { describe, expect, it } from 'vitest';
import { emoteImageUrlOf } from '@/emotes/emote-images';
import { EMOTES } from '@/lib/emote-catalog';

describe('emoteImageUrlOf', () => {
  it('has a picture for every emote of the catalog', () => {
    for (const emote of EMOTES) expect(emoteImageUrlOf(emote.id)).toMatch(/\S/u);
  });

  it('refuses an unknown id, naming it and the file it expected', () => {
    expect(() => emoteImageUrlOf('nope')).toThrow(/"nope".*src\/emotes\/images\/nope\.png/u);
  });
});
