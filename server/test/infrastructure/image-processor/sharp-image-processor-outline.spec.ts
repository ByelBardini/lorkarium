import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { SharpImageProcessor } from '../../../src/infrastructure/image-processor/sharp-image-processor';
import type {
  NormalizedImage,
  NormalizeOutcome,
} from '../../../src/modules/assets/image-processor.port';
import { animatedGifOf } from '../../support/images';

type AlphaAt = (x: number, y: number) => number;
type OutlinePolygon = NonNullable<NormalizedImage['outline']>[number];

const processor = new SharpImageProcessor();
const TOKEN = { maxSide: 1024 };
const TRACED = { maxSide: 1024, outline: true };
const AURA = { maxSide: 512, animation: { maxFrames: 120, maxDecodedPixels: 16_000_000 } };
const MIDDLE_SQUARE = [
  [0.25, 0.25],
  [0.25, 0.75],
  [0.75, 0.25],
  [0.75, 0.75],
];
const UNIT_SQUARE = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
];

// One RGBA PNG whose alpha is chosen per pixel, so a spec can draw any cut-out by hand.
async function pngOfAlpha(width: number, height: number, alphaAt: AlphaAt): Promise<Uint8Array> {
  const pixels = Buffer.alloc(width * height * 4, 200);
  for (let at = 0; at < width * height; at += 1) {
    pixels[at * 4 + 3] = alphaAt(at % width, Math.floor(at / width));
  }
  const raw = { width, height, channels: 4 } as const;
  return new Uint8Array(await sharp(pixels, { raw }).png().toBuffer());
}

function between(value: number, from: number, to: number): boolean {
  return value >= from && value < to;
}

function middleSquarePng(): Promise<Uint8Array> {
  return pngOfAlpha(100, 100, (x, y) => (between(x, 25, 75) && between(y, 25, 75) ? 255 : 0));
}

function keptOf(outcome: NormalizeOutcome): NormalizedImage {
  if (!outcome.ok) throw new Error(`expected the image kept, got ${outcome.refusal.detail}`);
  return outcome.image;
}

function cornersOf(outline: NormalizedImage['outline']): number[][] {
  const points = (outline?.[0] ?? []).map(([x, y]) => [x, y]);
  return points.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0) || (a[1] ?? 0) - (b[1] ?? 0));
}

function areaOf(polygon: OutlinePolygon): number {
  const doubled = polygon.reduce((sum, [x, y], at) => {
    const [nextX, nextY] = polygon[(at + 1) % polygon.length] ?? [x, y];
    return sum + x * nextY - nextX * y;
  }, 0);
  return Math.abs(doubled) / 2;
}

describe('SharpImageProcessor.normalize with the outline asked', () => {
  it('a cut-out square in the middle of a 100×100 PNG gives one polygon with its 4 corners', async () => {
    const { outline } = keptOf(await processor.normalize(await middleSquarePng(), TRACED));

    expect(outline).toHaveLength(1);
    expect(cornersOf(outline)).toEqual(MIDDLE_SQUARE);
  });

  it('an opaque 200×100 PNG is its own rectangle, contained, y from 0.25 to 0.75', async () => {
    const png = await pngOfAlpha(200, 100, () => 255);

    const { outline } = keptOf(await processor.normalize(png, TRACED));

    expect(cornersOf(outline)).toEqual([
      [0, 0.25],
      [0, 0.75],
      [1, 0.25],
      [1, 0.75],
    ]);
  });

  it('a JPEG, having no alpha, is the rectangle of the image', async () => {
    const create = { width: 100, height: 100, channels: 3, background: 'red' } as const;
    const jpeg = await sharp({ create }).jpeg().toBuffer();

    const { outline } = keptOf(await processor.normalize(new Uint8Array(jpeg), TRACED));

    expect(cornersOf(outline)).toEqual(UNIT_SQUARE);
  });

  it('a WebP keeps its cut-out', async () => {
    const webp = await sharp(await middleSquarePng())
      .webp({ lossless: true })
      .toBuffer();

    const { outline } = keptOf(await processor.normalize(new Uint8Array(webp), TRACED));

    expect(cornersOf(outline)).toEqual(MIDDLE_SQUARE);
  });

  it('a grey PNG with alpha reads the alpha, not the grey', async () => {
    const grey = await sharp(await middleSquarePng())
      .toColourspace('b-w')
      .png()
      .toBuffer();
    expect((await sharp(grey).metadata()).channels).toBe(2);

    const { outline } = keptOf(await processor.normalize(new Uint8Array(grey), TRACED));

    expect(cornersOf(outline)).toEqual(MIDDLE_SQUARE);
  });

  it('a 16-bit PNG reads its alpha at the same scale', async () => {
    const deep = await sharp(await middleSquarePng())
      .toColourspace('rgb16')
      .png()
      .toBuffer();
    expect((await sharp(deep).metadata()).depth).toBe('ushort');

    const { outline } = keptOf(await processor.normalize(new Uint8Array(deep), TRACED));

    expect(cornersOf(outline)).toEqual(MIDDLE_SQUARE);
  });

  it('a fully transparent PNG gives an empty list', async () => {
    const png = await pngOfAlpha(64, 64, () => 0);

    expect(keptOf(await processor.normalize(png, TRACED)).outline).toEqual([]);
  });

  it('alpha 128 in the real file is solid', async () => {
    const png = await pngOfAlpha(8, 8, () => 128);

    expect(keptOf(await processor.normalize(png, TRACED)).outline).toHaveLength(1);
  });

  it('alpha 127 in the real file is empty', async () => {
    const png = await pngOfAlpha(8, 8, () => 127);

    expect(keptOf(await processor.normalize(png, TRACED)).outline).toEqual([]);
  });

  it('an 800×800 circle, read through the reduced grid, fits 48 vertices and keeps its area', async () => {
    const inCircle: AlphaAt = (x, y) => (Math.hypot(x - 400, y - 400) <= 300 ? 255 : 0);
    const png = await pngOfAlpha(800, 800, inCircle);

    const { outline } = keptOf(await processor.normalize(png, TRACED));

    const polygon = outline?.[0] ?? [];
    const realArea = Math.PI * (300 / 800) ** 2;
    expect(outline).toHaveLength(1);
    expect(polygon.length).toBeLessThanOrEqual(48);
    expect(Math.abs(areaOf(polygon) - realArea) / realArea).toBeLessThan(0.05);
  });

  it('the outline follows the kept image: a square crop leaves only what stayed', async () => {
    const png = await pngOfAlpha(300, 100, (x) => (between(x, 100, 200) ? 255 : 0));
    const square = { maxSide: 256, square: true, outline: true };

    const { outline } = keptOf(await processor.normalize(png, square));

    expect(cornersOf(outline)).toEqual(UNIT_SQUARE);
  });

  it('asking the outline does not change the bytes kept', async () => {
    const png = await middleSquarePng();

    const plain = keptOf(await processor.normalize(png, TOKEN));
    const traced = keptOf(await processor.normalize(png, TRACED));

    expect([...traced.bytes]).toEqual([...plain.bytes]);
  });

  it('a GIF kept animated has no outline even when asked', async () => {
    const gif = new Uint8Array(await animatedGifOf(3, 16));

    const image = keptOf(await processor.normalize(gif, { ...AURA, outline: true }));

    expect(image.outline).toBeNull();
  });
});

describe('SharpImageProcessor.normalize without the outline asked', () => {
  it('nothing is traced: the outline is null', async () => {
    const { outline } = keptOf(await processor.normalize(await middleSquarePng(), TOKEN));

    expect(outline).toBeNull();
  });

  it('outline false traces nothing either', async () => {
    const options = { ...TOKEN, outline: false };

    const { outline } = keptOf(await processor.normalize(await middleSquarePng(), options));

    expect(outline).toBeNull();
  });
});
