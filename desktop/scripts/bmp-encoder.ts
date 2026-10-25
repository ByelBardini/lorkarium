export interface RgbImage {
  width: number;
  height: number;
  /** Row-major, top row first, 3 bytes (R, G, B) per pixel. */
  rgb: Uint8Array;
}

const FILE_HEADER_BYTES = 14;
const INFO_HEADER_BYTES = 40;
const PIXELS_OFFSET = FILE_HEADER_BYTES + INFO_HEADER_BYTES;
// 72 DPI; Windows ignores it when it draws the bitmap, but the field cannot be empty.
const PIXELS_PER_METER = 2835;

/**
 * Encodes an image as an uncompressed 24-bit BMP, the only bitmap format NSIS `LoadImage` reads
 * (sharp writes no BMP at all).
 *
 * Example: `writeFileSync('hero-100.bmp', encodeBmp24({ width, height, rgb }))`
 */
export function encodeBmp24(image: RgbImage): Uint8Array {
  assertPixelCount(image);
  const rowBytes = Math.ceil((image.width * 3) / 4) * 4;
  const bmp = Buffer.alloc(PIXELS_OFFSET + rowBytes * image.height);
  writeHeaders(bmp, image, rowBytes);
  for (let row = 0; row < image.height; row++) {
    writeRow(bmp, image, row, PIXELS_OFFSET + (image.height - 1 - row) * rowBytes);
  }
  return bmp;
}

function assertPixelCount(image: RgbImage): void {
  const expected = image.width * image.height * 3;
  if (image.rgb.length === expected) return;
  throw new Error(
    `encodeBmp24: got ${image.rgb.length} bytes for a ${image.width}×${image.height} image, expected ${expected} (R, G, B per pixel)`,
  );
}

function writeHeaders(bmp: Buffer, image: RgbImage, rowBytes: number): void {
  bmp.write('BM', 0, 'latin1');
  bmp.writeUInt32LE(bmp.length, 2);
  bmp.writeUInt32LE(PIXELS_OFFSET, 10);
  bmp.writeUInt32LE(INFO_HEADER_BYTES, 14);
  bmp.writeInt32LE(image.width, 18);
  bmp.writeInt32LE(image.height, 22);
  bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28);
  bmp.writeUInt32LE(0, 30);
  bmp.writeUInt32LE(rowBytes * image.height, 34);
  bmp.writeInt32LE(PIXELS_PER_METER, 38);
  bmp.writeInt32LE(PIXELS_PER_METER, 42);
}

function writeRow(bmp: Buffer, image: RgbImage, row: number, target: number): void {
  for (let column = 0; column < image.width; column++) {
    const source = (row * image.width + column) * 3;
    bmp[target + column * 3] = image.rgb[source + 2] ?? 0;
    bmp[target + column * 3 + 1] = image.rgb[source + 1] ?? 0;
    bmp[target + column * 3 + 2] = image.rgb[source] ?? 0;
  }
}
