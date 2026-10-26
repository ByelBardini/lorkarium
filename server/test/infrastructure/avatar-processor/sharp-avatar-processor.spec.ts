import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { SharpAvatarProcessor } from '../../../src/infrastructure/avatar-processor/sharp-avatar-processor';
import type {
  AvatarOutcome,
  AvatarRefusal,
  NormalizedAvatar,
} from '../../../src/modules/profiles/avatar-processor.port';

const LEFT = { r: 220, g: 30, b: 30 };
const MIDDLE = { r: 30, g: 200, b: 60 };

async function solid(width: number, height: number, background: object): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background } })
    .png()
    .toBuffer();
}

// 800×400: a red band on each side and a green 400×400 square in the middle.
async function bandedPng(): Promise<Uint8Array> {
  const middle = await solid(400, 400, MIDDLE);
  const image = sharp({ create: { width: 800, height: 400, channels: 3, background: LEFT } });
  return new Uint8Array(
    await image
      .composite([{ input: middle, left: 200, top: 0 }])
      .png()
      .toBuffer(),
  );
}

// Frames far apart in color, so the GIF encoder does not merge them.
async function animatedGif(frames: number): Promise<Uint8Array> {
  const colors = [LEFT, MIDDLE, { r: 30, g: 30, b: 220 }];
  const images = await Promise.all(
    Array.from({ length: frames }, (_, index) => solid(300, 200, colors[index % 3] ?? LEFT)),
  );
  const [first] = images;
  // sharp's join refuses a single image, so one frame is a plain GIF.
  const source = frames === 1 && first ? sharp(first) : sharp(images, { join: { animated: true } });
  return new Uint8Array(await source.gif().toBuffer());
}

function keptOf(outcome: AvatarOutcome): NormalizedAvatar {
  if (!outcome.ok) throw new Error(`expected the photo kept, got ${outcome.refusal.detail}`);
  return outcome.avatar;
}

function refusalOf(outcome: AvatarOutcome): AvatarRefusal {
  if (outcome.ok) throw new Error('expected a refusal, got a kept photo');
  return outcome.refusal;
}

const processor = new SharpAvatarProcessor();

describe('SharpAvatarProcessor.normalize', () => {
  it('an 800×400 PNG becomes a 256×256 WebP cut from its center', async () => {
    const avatar = keptOf(await processor.normalize(await bandedPng()));

    const metadata = await sharp(avatar.bytes).metadata();
    expect([metadata.format, metadata.width, metadata.height]).toEqual(['webp', 256, 256]);
    const { data } = await sharp(avatar.bytes).raw().toBuffer({ resolveWithObject: true });
    // The left edge of the square is green: the red bands were cut away.
    expect(data[1]).toBeGreaterThan(150);
    expect(data[0]).toBeLessThan(100);
  });

  it('a 3-frame GIF becomes an animated WebP with three 256×256 frames', async () => {
    const avatar = keptOf(await processor.normalize(await animatedGif(3)));

    expect(avatar.frames).toBe(3);
    const metadata = await sharp(avatar.bytes, { animated: true }).metadata();
    expect(metadata).toMatchObject({ format: 'webp', width: 256, pages: 3, pageHeight: 256 });
  });

  it('a JPEG with a GPS position in its EXIF comes out without any EXIF', async () => {
    const jpeg = await sharp(await solid(80, 60, MIDDLE))
      .jpeg()
      .withExif({ IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '23/1 32/1 0/1' } })
      .toBuffer();
    expect((await sharp(jpeg).metadata()).exif).toBeDefined();

    const avatar = keptOf(await processor.normalize(new Uint8Array(jpeg)));

    expect((await sharp(avatar.bytes).metadata()).exif).toBeUndefined();
  });

  it('an SVG is refused by its format, citing what is expected', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');

    const refusal = refusalOf(await processor.normalize(new Uint8Array(svg)));

    expect(refusal.reason).toBe('format');
    expect(refusal.detail).toBe('format svg is not kept; expected png, jpeg, webp or gif');
  });

  it('HTML is refused as not an image', async () => {
    const html = new Uint8Array(Buffer.from('<html><body>oi</body></html>'));

    const refusal = refusalOf(await processor.normalize(html));

    expect(refusal.reason).toBe('not-an-image');
    expect(refusal.detail).toContain('expected png, jpeg, webp or gif');
  });

  it('an animation above the frame limit is refused citing the limit', async () => {
    const strict = new SharpAvatarProcessor({ maxFrames: 2 });

    const refusal = refusalOf(await strict.normalize(await animatedGif(3)));

    expect(refusal).toEqual({
      reason: 'too-many-frames',
      detail: 'the photo has 3 frames; expected at most 2 frames',
    });
  });

  it('pixels × frames above the budget is refused before decoding', async () => {
    const strict = new SharpAvatarProcessor({ maxTotalPixels: 150_000 });

    const refusal = refusalOf(await strict.normalize(await animatedGif(3)));

    expect(refusal).toEqual({
      reason: 'too-many-pixels',
      detail: 'the photo has 180000 pixels across 3 frames; expected at most 150000',
    });
  });

  it('a single frame inside the budget is kept with a budget that 3 frames would break', async () => {
    const strict = new SharpAvatarProcessor({ maxTotalPixels: 150_000 });

    const avatar = keptOf(await strict.normalize(await animatedGif(1)));

    expect(avatar.frames).toBe(1);
  });

  describe('as a still dice texture ({ side: 512, animated: false })', () => {
    const texture = { side: 512, animated: false } as const;

    it('an 800×400 PNG becomes a 512×512 WebP cut from its center', async () => {
      const kept = keptOf(await processor.normalize(await bandedPng(), texture));

      const metadata = await sharp(kept.bytes).metadata();
      expect([metadata.format, metadata.width, metadata.height]).toEqual(['webp', 512, 512]);
      const { data } = await sharp(kept.bytes).raw().toBuffer({ resolveWithObject: true });
      expect(data[1]).toBeGreaterThan(150);
    });

    it('a 3-frame GIF keeps only its first frame', async () => {
      const kept = keptOf(await processor.normalize(await animatedGif(3), texture));

      expect(kept.frames).toBe(1);
      const metadata = await sharp(kept.bytes, { animated: true }).metadata();
      expect(metadata).toMatchObject({ format: 'webp', width: 512, height: 512 });
      expect(metadata.pages ?? 1).toBe(1);
    });

    it('a GIF above the frame limit is still refused before decoding', async () => {
      const strict = new SharpAvatarProcessor({ maxFrames: 2 });

      const refusal = refusalOf(await strict.normalize(await animatedGif(3), texture));

      expect(refusal.reason).toBe('too-many-frames');
    });
  });
});
