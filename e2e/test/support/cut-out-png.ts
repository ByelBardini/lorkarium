import { crc32, deflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const COLOR_TYPE_RGBA = 6;
const OPAQUE_WHITE = [255, 255, 255, 255] as const;
const TRANSPARENT = [0, 0, 0, 0] as const;

export type CutOutBand = Readonly<{ side: number; fromRow: number; toRow: number }>;

function chunkOf(type: string, body: Buffer): Buffer {
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), body]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

function headerOf(side: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(side, 0);
  header.writeUInt32BE(side, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(COLOR_TYPE_RGBA, 9);
  return header;
}

// Each scanline starts with its filter byte (0: none).
function scanlinesOf({ side, fromRow, toRow }: CutOutBand): Buffer {
  const lines: number[] = [];
  for (let row = 0; row < side; row += 1) {
    const pixel = row >= fromRow && row < toRow ? OPAQUE_WHITE : TRANSPARENT;
    lines.push(0, ...Array.from({ length: side }, () => pixel).flat());
  }
  return Buffer.from(lines);
}

/** A square PNG, transparent but for a white horizontal band from `fromRow` to `toRow` (excluded):
 *  an image whose outline is far from its rectangle. Written here because the e2e has no image
 *  library.
 *
 *  Example: `input.setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: cutOutBandPng({ side: 128, fromRow: 43, toRow: 85 }) })` */
export function cutOutBandPng(band: CutOutBand): Buffer {
  return Buffer.concat([
    PNG_SIGNATURE,
    chunkOf('IHDR', headerOf(band.side)),
    chunkOf('IDAT', deflateSync(scanlinesOf(band))),
    chunkOf('IEND', Buffer.alloc(0)),
  ]);
}
