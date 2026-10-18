import { describe, expect, it } from 'vitest';
import { TOKEN_SIZE_MAX, TOKEN_SIZE_MIN, tokenSize } from '../src/token-size.vo';

describe('tokenSize', () => {
  it('a 2.5 × 0.5 token keeps both sides on their own', () => {
    expect(tokenSize(2.5, 0.5)).toEqual({ width: 2.5, height: 0.5 });
  });

  it('the limits are half a cell and ten cells, both inclusive', () => {
    expect(tokenSize(TOKEN_SIZE_MIN, TOKEN_SIZE_MAX)).toEqual({ width: 0.5, height: 10 });
  });

  it('a built size is frozen', () => {
    expect(Object.isFrozen(tokenSize(1, 1))).toBe(true);
  });

  it.each([
    [0.25, 1, 'width', '0.25'],
    [0, 1, 'width', '0'],
    [1, 10.5, 'height', '10.5'],
    [1, Number.NaN, 'height', 'NaN'],
  ])(
    'tokenSize(%s, %s) is refused citing the %s %s and the expected shape',
    (w, h, axis, shown) => {
      expect(() => tokenSize(w, h)).toThrow(
        new RegExp(`${axis} ${shown}.*multiple of 0.5 from 0.5 to 10`),
      );
    },
  );
});
