import { describe, expect, it } from 'vitest';
import { diceTextureUrlOf } from '@/lib/dice-texture-url';

describe('diceTextureUrlOf', () => {
  it('a texture id becomes its path under /api', () => {
    expect(diceTextureUrlOf('3f2a1b0c-9d8e-4f7a-8b6c-5d4e3f2a1b0c')).toBe(
      '/api/dice-textures/3f2a1b0c-9d8e-4f7a-8b6c-5d4e3f2a1b0c',
    );
  });

  it('an id with a slash stays one path segment', () => {
    expect(diceTextureUrlOf('a/b')).toBe('/api/dice-textures/a%2Fb');
  });
});
