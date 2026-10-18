import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { SharpImageProcessor } from '../../../src/infrastructure/image-processor/sharp-image-processor';
import type {
  NormalizedImage,
  NormalizeOutcome,
} from '../../../src/modules/assets/image-processor.port';

type Format = 'png' | 'jpeg' | 'webp' | 'gif';

async function imageOf(width: number, height: number, format: Format, alpha = false) {
  const channels = alpha ? 4 : 3;
  const background = alpha ? { r: 200, g: 80, b: 40, alpha: 0.5 } : { r: 200, g: 80, b: 40 };
  return new Uint8Array(
    await sharp({ create: { width, height, channels, background } }).toFormat(format).toBuffer(),
  );
}

function keptOf(outcome: NormalizeOutcome): NormalizedImage {
  if (!outcome.ok) throw new Error(`expected the image kept, got ${outcome.refusal.detail}`);
  return outcome.image;
}

const processor = new SharpImageProcessor();
const TOKEN = { maxSide: 1024 };
const BACKGROUND = { maxSide: 4096 };

describe('SharpImageProcessor.normalize', () => {
  it('a 300×200 PNG with alpha stays a 300×200 PNG with four channels', async () => {
    const image = keptOf(await processor.normalize(await imageOf(300, 200, 'png', true), TOKEN));

    expect(image).toMatchObject({ mimeType: 'image/png', width: 300, height: 200 });
    expect((await sharp(image.bytes).metadata()).channels).toBe(4);
  });

  it('a WebP stays a WebP', async () => {
    const image = keptOf(await processor.normalize(await imageOf(64, 64, 'webp'), TOKEN));

    expect(image.mimeType).toBe('image/webp');
    expect((await sharp(image.bytes).metadata()).format).toBe('webp');
  });

  it('a JPEG with a GPS position in its EXIF comes out without any EXIF', async () => {
    const withGps = await sharp(await imageOf(80, 60, 'jpeg'))
      .withExif({ IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '23/1 32/1 0/1' } })
      .toBuffer();
    expect((await sharp(withGps).metadata()).exif).toBeDefined();

    const image = keptOf(await processor.normalize(new Uint8Array(withGps), TOKEN));

    expect(image.mimeType).toBe('image/jpeg');
    expect((await sharp(image.bytes).metadata()).exif).toBeUndefined();
  });

  it('a 6000×3000 background is reduced to 4096×2048', async () => {
    const image = keptOf(await processor.normalize(await imageOf(6000, 3000, 'png'), BACKGROUND));

    expect([image.width, image.height]).toEqual([4096, 2048]);
  });

  it('a 4096×100 background exactly at the limit keeps its size', async () => {
    const image = keptOf(await processor.normalize(await imageOf(4096, 100, 'png'), BACKGROUND));

    expect([image.width, image.height]).toEqual([4096, 100]);
  });

  it('a 200×100 JPEG with EXIF orientation 6 comes out upright as 100×200 without the tag', async () => {
    const rotated = await sharp(await imageOf(200, 100, 'jpeg'))
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const image = keptOf(await processor.normalize(new Uint8Array(rotated), TOKEN));

    expect([image.width, image.height]).toEqual([100, 200]);
    expect((await sharp(image.bytes).metadata()).orientation).toBeUndefined();
  });

  it('a PNG with a payload appended after IEND is rewritten without it and still decodes', async () => {
    const payload = Buffer.from('<?php system($_GET["c"]); ?>');
    const smuggled = new Uint8Array(Buffer.concat([await imageOf(32, 32, 'png'), payload]));

    const image = keptOf(await processor.normalize(smuggled, TOKEN));

    expect(Buffer.from(image.bytes).includes(payload)).toBe(false);
    expect((await sharp(image.bytes).metadata()).format).toBe('png');
  });

  it('200 bytes of HTML are refused as bytes that do not decode', async () => {
    const html = new Uint8Array(Buffer.from('<html>'.padEnd(200, ' ')));

    expect(await processor.normalize(html, TOKEN)).toEqual({
      ok: false,
      refusal: {
        reason: 'not-an-image',
        detail: 'the 200 bytes do not decode as an image; expected png, jpeg or webp',
      },
    });
  });

  it('a GIF is refused citing gif and the accepted formats', async () => {
    expect(await processor.normalize(await imageOf(16, 16, 'gif'), TOKEN)).toEqual({
      ok: false,
      refusal: { reason: 'format', detail: 'format gif is not kept; expected png, jpeg or webp' },
    });
  });

  it('an SVG is refused even though sharp could render it', async () => {
    const svg = new Uint8Array(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script/></svg>'),
    );

    expect(await processor.normalize(svg, TOKEN)).toMatchObject({
      ok: false,
      refusal: { reason: 'format', detail: expect.stringMatching(/svg.*png, jpeg or webp/) },
    });
  });

  it('an image above the input pixel limit is refused citing its pixels and the limit', async () => {
    const small = new SharpImageProcessor({ maxInputPixels: 1000 });

    expect(await small.normalize(await imageOf(40, 40, 'png'), TOKEN)).toMatchObject({
      ok: false,
      refusal: { reason: 'too-many-pixels', detail: expect.stringMatching(/1600 pixels.*1000/) },
    });
  });
});
