import { describe, expect, it } from 'vitest';
import {
  animationFor,
  dedicatedEndpointOf,
  isMasterOnlyAssetPurpose,
  isProtectedAssetPurpose,
  outlineFor,
  resizeFor,
  requireSize,
  requireWoff2,
} from '../../../src/modules/assets/asset-upload.bo';
import { AssetTooLargeError } from '../../../src/modules/assets/assets.error';

const MIB = 1024 * 1024;
const LIMIT = 20 * MIB;
const SIDES = {
  document_image: 4096,
  sheet_image: 4096,
  sheet_template_asset: 4096,
  library_image: 4096,
  library_map: 8192,
  background: 4096,
  token: 1024,
  cover: 1600,
  condition: 256,
  aura: 512,
};
const ANIMATION = { maxFrames: 120, maxDecodedPixels: 16_000_000 };

describe('resizeFor', () => {
  it('a condition image is kept as a square of at most 256 px', () => {
    expect(resizeFor('condition', SIDES)).toEqual({ maxSide: 256, square: true });
  });

  it.each([
    ['token', 1024],
    ['background', 4096],
    ['library_image', 4096],
    ['library_map', 8192],
    ['document_image', 4096],
    ['sheet_image', 4096],
    ['sheet_template_asset', 4096],
    ['cover', 1600],
    ['aura', 512],
  ] as const)('a %s image keeps its shape, up to %i px', (purpose, maxSide) => {
    expect(resizeFor(purpose, SIDES)).toEqual({ maxSide, square: false });
  });
});

describe('animationFor', () => {
  it('an aura image may stay animated within 120 frames and 16 MP decoded', () => {
    expect(animationFor('aura', ANIMATION)).toEqual({
      maxFrames: 120,
      maxDecodedPixels: 16_000_000,
    });
  });

  it.each(['token', 'background', 'cover', 'condition'] as const)(
    'a %s image never animates (no budget)',
    (purpose) => {
      expect(animationFor(purpose, ANIMATION)).toBeNull();
    },
  );
});

describe('outlineFor', () => {
  it('a token image gets its silhouette traced', () => {
    expect(outlineFor('token')).toBe(true);
  });

  it.each([
    'background',
    'cover',
    'condition',
    'aura',
    'library_image',
    'document_image',
    'sheet_image',
    'library_map',
  ] as const)('a %s image is not traced', (purpose) => {
    expect(outlineFor(purpose)).toBe(false);
  });
});

describe('isProtectedAssetPurpose', () => {
  it.each([
    'library_image',
    'document_image',
    'sheet_image',
    'sheet_template_asset',
    'library_map',
  ] as const)('a %s is read only through its policy', (purpose) => {
    expect(isProtectedAssetPurpose(purpose)).toBe(true);
  });

  it.each(['background', 'token', 'cover', 'condition', 'aura'] as const)(
    'a %s is read by any member of the campaign',
    (purpose) => {
      expect(isProtectedAssetPurpose(purpose)).toBe(false);
    },
  );
});

describe('isMasterOnlyAssetPurpose', () => {
  it.each(['library_image', 'library_map', 'sheet_template_asset'] as const)(
    'a %s is sent by the master',
    (purpose) => {
      expect(isMasterOnlyAssetPurpose(purpose)).toBe(true);
    },
  );

  it.each([
    'background',
    'token',
    'cover',
    'condition',
    'aura',
    'document_image',
    'sheet_image',
  ] as const)('a %s is not reserved to the master', (purpose) => {
    expect(isMasterOnlyAssetPurpose(purpose)).toBe(false);
  });
});

describe('dedicatedEndpointOf', () => {
  it.each([
    ['document_image', 'the document image endpoint'],
    ['sheet_image', 'the sheet image endpoint'],
    ['sheet_template_asset', 'the sheet template asset endpoint'],
  ] as const)('a %s is sent only through %s', (purpose, endpoint) => {
    expect(dedicatedEndpointOf(purpose)).toBe(endpoint);
  });

  it.each([
    'background',
    'token',
    'cover',
    'condition',
    'aura',
    'library_image',
    'library_map',
  ] as const)('a %s goes through the generic asset routes', (purpose) => {
    expect(dedicatedEndpointOf(purpose)).toBeNull();
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

describe('requireWoff2', () => {
  it('a file that starts with wOF2 passes', () =>
    expect(() => requireWoff2(new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 1, 0, 0]))).not.toThrow());

  it.each([
    ['a TTF', [0x00, 0x01, 0x00, 0x00, 0x00], '00 01 00 00'],
    ['a WOFF 1', [0x77, 0x4f, 0x46, 0x46, 0x00], '77 4f 46 46'],
    ['an OTF', [0x4f, 0x54, 0x54, 0x4f], '4f 54 54 4f'],
  ])('%s renamed .woff2 is UNSUPPORTED_FONT citing what it starts with', (_kind, bytes, head) =>
    expect(() => requireWoff2(new Uint8Array(bytes))).toThrow(
      expect.objectContaining({
        code: 'UNSUPPORTED_FONT',
        message: expect.stringContaining(`start with ${head}; expected a WOFF2 font`),
      }),
    ),
  );

  it('an empty file is UNSUPPORTED_FONT', () =>
    expect(() => requireWoff2(new Uint8Array())).toThrow(
      expect.objectContaining({ message: expect.stringContaining('start with nothing') }),
    ));
});
