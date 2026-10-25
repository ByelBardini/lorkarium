import { describe, expect, it } from 'vitest';
import { resizeFor, requireSize } from '../../../src/modules/assets/asset-upload.bo';
import { AssetTooLargeError } from '../../../src/modules/assets/assets.error';

const MIB = 1024 * 1024;
const LIMIT = 20 * MIB;
const SIDES = { background: 4096, token: 1024, cover: 1600, condition: 256 };

describe('resizeFor', () => {
  it('a condition image is kept as a square of at most 256 px', () => {
    expect(resizeFor('condition', SIDES)).toEqual({ maxSide: 256, square: true });
  });

  it.each([
    ['token', 1024],
    ['background', 4096],
    ['cover', 1600],
  ] as const)('a %s image keeps its shape, up to %i px', (purpose, maxSide) => {
    expect(resizeFor(purpose, SIDES)).toEqual({ maxSide, square: false });
  });
});

describe('requireSize', () => {
  it('a file of exactly 20 MiB passes', () => {
    expect(() => requireSize(20 * MIB, LIMIT)).not.toThrow();
  });

  it('a file one byte above 20 MiB is refused citing its size and the limit', () => {
    const refuse = () => requireSize(20 * MIB + 1, LIMIT);

    expect(refuse).toThrow(AssetTooLargeError);
    expect(refuse).toThrow(`${20 * MIB + 1} bytes; expected at most ${20 * MIB}`);
  });
});
