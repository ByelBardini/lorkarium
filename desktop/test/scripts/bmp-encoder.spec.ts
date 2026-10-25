import { describe, expect, it } from 'vitest';
import { encodeBmp24 } from '../../scripts/bmp-encoder';

const RED = [255, 0, 0];
const BLUE = [0, 0, 255];

function rgbImage(
  width: number,
  height: number,
  pixels: number[][],
): Parameters<typeof encodeBmp24>[0] {
  return { width, height, rgb: Uint8Array.from(pixels.flat()) };
}

describe('encodeBmp24', () => {
  it('writes the BITMAPINFOHEADER of an uncompressed 24-bit bottom-up image', () => {
    const bmp = Buffer.from(
      encodeBmp24(
        rgbImage(
          2,
          3,
          Array.from({ length: 6 }, () => RED),
        ),
      ),
    );

    expect(bmp.toString('latin1', 0, 2)).toBe('BM');
    expect(bmp.readUInt32LE(2)).toBe(54 + 8 * 3);
    expect(bmp.readUInt32LE(10)).toBe(54);
    expect(bmp.readUInt32LE(14)).toBe(40);
    expect(bmp.readInt32LE(18)).toBe(2);
    expect(bmp.readInt32LE(22)).toBe(3);
    expect(bmp.readUInt16LE(26)).toBe(1);
    expect(bmp.readUInt16LE(28)).toBe(24);
    expect(bmp.readUInt32LE(30)).toBe(0);
    expect(bmp.readUInt32LE(34)).toBe(8 * 3);
  });

  it('pads every row to a multiple of 4 bytes', () => {
    const bmp = encodeBmp24(rgbImage(1, 2, [RED, BLUE]));

    expect(bmp.length).toBe(54 + 4 * 2);
    expect(Array.from(bmp.subarray(54 + 3, 54 + 4))).toEqual([0]);
  });

  it('stores the bottom row first, each pixel as blue, green, red', () => {
    const bmp = encodeBmp24(rgbImage(1, 2, [RED, BLUE]));

    expect(Array.from(bmp.subarray(54, 57))).toEqual([255, 0, 0]);
    expect(Array.from(bmp.subarray(58, 61))).toEqual([0, 0, 255]);
  });

  it('refuses pixels that do not match width × height × 3, citing both', () => {
    const tooShort = { width: 2, height: 2, rgb: new Uint8Array(9) };

    expect(() => encodeBmp24(tooShort)).toThrow(/9 bytes.*2×2.*12/);
  });
});
