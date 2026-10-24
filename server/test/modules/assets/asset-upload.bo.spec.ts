import { describe, expect, it } from 'vitest';
import { maxSideFor, requireSize } from '../../../src/modules/assets/asset-upload.bo';
import { AssetTooLargeError } from '../../../src/modules/assets/assets.error';

const MIB = 1024 * 1024;
const LIMIT = 20 * MIB;
const SIDES = { background: 4096, token: 1024, cover: 1600 };

describe('maxSideFor', () => {
  it('a token image is kept up to 1024 px and a background up to 4096 px', () => {
    expect(maxSideFor('token', SIDES)).toBe(1024);
    expect(maxSideFor('background', SIDES)).toBe(4096);
  });

  it('a cover image is kept up to its own side', () => {
    expect(maxSideFor('cover', SIDES)).toBe(1600);
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
