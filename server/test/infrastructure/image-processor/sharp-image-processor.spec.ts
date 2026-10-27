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

type Rgb = Readonly<{ r: number; g: number; b: number }>;

const RED: Rgb = { r: 255, g: 0, b: 0 };
const BLUE: Rgb = { r: 0, g: 0, b: 255 };

// 300×100 blue with the middle third red: only a centred square crop is all red.
async function redMiddleStripe(): Promise<Uint8Array> {
  const stripe = await sharp({ create: { width: 100, height: 100, channels: 3, background: RED } })
    .png()
    .toBuffer();
  const sides = sharp({ create: { width: 300, height: 100, channels: 3, background: BLUE } });
  return new Uint8Array(
    await sides
      .composite([{ input: stripe, left: 100, top: 0 }])
      .png()
      .toBuffer(),
  );
}

async function pixelAt(bytes: Uint8Array, x: number, y: number): Promise<Rgb> {
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  const at = (y * info.width + x) * info.channels;
  return { r: data[at] ?? -1, g: data[at + 1] ?? -1, b: data[at + 2] ?? -1 };
}

async function animatedWebp(frames: number): Promise<Uint8Array> {
  const colours = [RED, BLUE, { r: 0, g: 255, b: 0 }];
  const pictures = await Promise.all(
    colours.slice(0, frames).map((background) => imageOf32(background)),
  );
  return new Uint8Array(
    await sharp(pictures, { join: { animated: true } })
      .webp()
      .toBuffer(),
  );
}

async function imageOf32(background: Rgb): Promise<Buffer> {
  return sharp({ create: { width: 32, height: 32, channels: 3, background } })
    .png()
    .toBuffer();
}

const processor = new SharpImageProcessor();
const TOKEN = { maxSide: 1024 };
const BACKGROUND = { maxSide: 4096 };
const CONDITION = { maxSide: 256, square: true };

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

describe('SharpImageProcessor.normalize with square', () => {
  it('a 600×300 PNG with alpha comes out a 256×256 PNG that keeps its alpha', async () => {
    const image = keptOf(
      await processor.normalize(await imageOf(600, 300, 'png', true), CONDITION),
    );

    expect(image).toMatchObject({ mimeType: 'image/png', width: 256, height: 256 });
    expect((await sharp(image.bytes).metadata()).channels).toBe(4);
  });

  it('the square is cut from the centre: the red middle stays and the blue ends go', async () => {
    const image = keptOf(await processor.normalize(await redMiddleStripe(), CONDITION));

    expect([image.width, image.height]).toEqual([100, 100]);
    expect(await pixelAt(image.bytes, 50, 50)).toEqual(RED);
    expect(await pixelAt(image.bytes, 0, 0)).toEqual(RED);
    expect(await pixelAt(image.bytes, 99, 99)).toEqual(RED);
  });

  it('a 200×100 image becomes 100×100, never enlarged to the 256 limit', async () => {
    const image = keptOf(await processor.normalize(await imageOf(200, 100, 'png'), CONDITION));

    expect([image.width, image.height]).toEqual([100, 100]);
  });

  it('a 100×200 JPEG with EXIF orientation 6 comes out a 100×100 square without the tag', async () => {
    const rotated = await sharp(await imageOf(100, 200, 'jpeg'))
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const image = keptOf(await processor.normalize(new Uint8Array(rotated), CONDITION));

    expect([image.width, image.height]).toEqual([100, 100]);
    expect((await sharp(image.bytes).metadata()).orientation).toBeUndefined();
  });

  it.each([
    ['without square', { maxSide: 1024 }],
    ['with square false', { maxSide: 1024, square: false }],
  ])('%s a 4096×2048 image stays rectangular at 1024×512', async (_, options) => {
    const image = keptOf(await processor.normalize(await imageOf(4096, 2048, 'png'), options));

    expect([image.width, image.height]).toEqual([1024, 512]);
  });

  it('a GIF is refused with square too, citing gif and the accepted formats', async () => {
    expect(await processor.normalize(await imageOf(16, 16, 'gif'), CONDITION)).toEqual({
      ok: false,
      refusal: { reason: 'format', detail: 'format gif is not kept; expected png, jpeg or webp' },
    });
  });
});

describe('SharpImageProcessor.normalize of an animation', () => {
  // Regression: a GIF is refused, so a moving image must not come back as an animated WebP.
  it.each([
    ['as a token', TOKEN],
    ['as a square condition', CONDITION],
  ])('a 3-frame animated WebP kept %s comes out with a single frame', async (_, options) => {
    const animation = await animatedWebp(3);
    expect((await sharp(animation, { animated: true }).metadata()).pages).toBe(3);

    const image = keptOf(await processor.normalize(animation, options));

    expect((await sharp(image.bytes, { animated: true }).metadata()).pages ?? 1).toBe(1);
    expect([image.width, image.height]).toEqual([32, 32]);
  });
});

const AURA = {
  maxSide: 512,
  animation: { maxFrames: 120, maxDecodedPixels: 16_000_000 },
};

// Frames far apart in colour, so the GIF encoder does not merge neighbours.
async function animatedGif(frames: number, side: number, delay?: number[]): Promise<Uint8Array> {
  const colours = [RED, BLUE, { r: 0, g: 255, b: 0 }];
  const pictures = await Promise.all(
    Array.from({ length: frames }, (_, index) =>
      sharp({
        create: { width: side, height: side, channels: 3, background: colours[index % 3] ?? RED },
      })
        .png()
        .toBuffer(),
    ),
  );
  const [first] = pictures;
  // sharp's join refuses a single image, so one frame is a plain GIF.
  const source =
    frames === 1 && first ? sharp(first) : sharp(pictures, { join: { animated: true } });
  return new Uint8Array(await source.gif(delay ? { delay } : {}).toBuffer());
}

async function framesOf(bytes: Uint8Array) {
  return sharp(bytes, { animated: true }).metadata();
}

describe('SharpImageProcessor.normalize with an animation budget', () => {
  it('a 3-frame 600×600 GIF stays an animated 512×512 GIF with the same delays', async () => {
    const gif = await animatedGif(3, 600, [100, 200, 100]);

    const image = keptOf(await processor.normalize(gif, AURA));

    expect(image).toMatchObject({ mimeType: 'image/gif', width: 512, height: 512 });
    const metadata = await framesOf(image.bytes);
    expect(metadata).toMatchObject({ format: 'gif', pages: 3, pageHeight: 512 });
    expect(metadata.delay).toEqual([100, 200, 100]);
  });

  // Encoding 100 frames is slow on a loaded CI runner; the 5 s default timed out there.
  it('a 100-frame 512×512 GIF shrinks to 400×400 to fit 16 MP and keeps its 100 frames', async () => {
    const image = keptOf(await processor.normalize(await animatedGif(100, 512), AURA));

    expect([image.width, image.height]).toEqual([400, 400]);
    expect((await framesOf(image.bytes)).pages).toBe(100);
  }, 30_000);

  it('a single-frame GIF with a budget is kept as a one-page GIF', async () => {
    const image = keptOf(await processor.normalize(await animatedGif(1, 64), AURA));

    expect(image).toMatchObject({ mimeType: 'image/gif', width: 64, height: 64 });
    expect((await framesOf(image.bytes)).pages ?? 1).toBe(1);
  });

  it('a 3-frame animated WebP with a budget comes out a still one-page WebP', async () => {
    const image = keptOf(await processor.normalize(await animatedWebp(3), AURA));

    expect(image.mimeType).toBe('image/webp');
    expect((await framesOf(image.bytes)).pages ?? 1).toBe(1);
  });

  it('a 121-frame GIF is refused for its frames, citing them and the limit of 120', async () => {
    expect(await processor.normalize(await animatedGif(121, 8), AURA)).toEqual({
      ok: false,
      refusal: {
        reason: 'too-many-frames',
        detail: 'the image has 121 frames; expected at most 120 frames',
      },
    });
  });

  it('a GIF whose frames add up past the input limit is refused before decoding', async () => {
    const small = new SharpImageProcessor({ maxInputPixels: 1000 });

    // Each 20×20 frame is 400 pixels, under the limit; the three together are 1200.
    expect(await small.normalize(await animatedGif(3, 20), AURA)).toMatchObject({
      ok: false,
      refusal: {
        reason: 'too-many-pixels',
        detail: expect.stringMatching(/1200 pixels across 3 frames.*1000/),
      },
    });
  });

  it('a GIF without a budget is still refused citing gif (token, background, cover, condition)', async () => {
    expect(await processor.normalize(await animatedGif(3, 16), TOKEN)).toEqual({
      ok: false,
      refusal: { reason: 'format', detail: 'format gif is not kept; expected png, jpeg or webp' },
    });
  });
});
