import { describe, expect, it } from 'vitest';
import { tokenLookStyle } from '@/renderer/token-look';

describe('tokenLookStyle', () => {
  it('without a look nor a defeat the token is drawn as always', () => {
    expect(tokenLookStyle({ looks: [], defeated: false })).toEqual({
      alpha: 1,
      grey: false,
      dashedOutline: false,
      sleeping: false,
    });
  });

  it('invisible: translucent with a dashed outline', () => {
    expect(tokenLookStyle({ looks: ['invisible'], defeated: false })).toEqual({
      alpha: 0.45,
      grey: false,
      dashedOutline: true,
      sleeping: false,
    });
  });

  it('unconscious: grey, a little faded, with "z z"', () => {
    expect(tokenLookStyle({ looks: ['unconscious'], defeated: false })).toEqual({
      alpha: 0.6,
      grey: true,
      dashedOutline: false,
      sleeping: true,
    });
  });

  it('both: the fainter alpha, grey, the outline and "z z"', () => {
    expect(tokenLookStyle({ looks: ['unconscious', 'invisible'], defeated: false })).toEqual({
      alpha: 0.45,
      grey: true,
      dashedOutline: true,
      sleeping: true,
    });
  });

  it('a defeated token that is unconscious keeps the alpha of the defeat, and goes grey', () => {
    expect(tokenLookStyle({ looks: ['unconscious'], defeated: true })).toMatchObject({
      alpha: 0.45,
      grey: true,
    });
  });

  it('a defeated token alone fades as before, without grey', () => {
    expect(tokenLookStyle({ looks: [], defeated: true })).toMatchObject({
      alpha: 0.45,
      grey: false,
    });
  });
});
