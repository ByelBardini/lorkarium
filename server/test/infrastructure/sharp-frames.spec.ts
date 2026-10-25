import sharp, { type Metadata } from 'sharp';
import { describe, expect, it } from 'vitest';
import { frameHeightOf, framesWithin } from '../../src/infrastructure/sharp-frames';

// A 3-frame 20 × 30 GIF: sharp reports it as one 20 × 90 strip of 30-pixel pages.
async function threeFrameGifMetadata(): Promise<Metadata> {
  const colours = [
    { r: 255, g: 0, b: 0 },
    { r: 0, g: 0, b: 255 },
    { r: 0, g: 255, b: 0 },
  ];
  const frames = await Promise.all(
    colours.map((background) =>
      sharp({ create: { width: 20, height: 30, channels: 3, background } })
        .png()
        .toBuffer(),
    ),
  );
  const gif = await sharp(frames, { join: { animated: true } })
    .gif()
    .toBuffer();
  return sharp(gif, { animated: true }).metadata();
}

describe('framesWithin', () => {
  it('a 3-frame GIF within both limits is let in with its 3 frames', async () => {
    const metadata = await threeFrameGifMetadata();

    expect(framesWithin(metadata, { maxFrames: 3, maxPixels: 1800 }, 'image')).toEqual({
      ok: true,
      frames: 3,
    });
  });

  it('one frame above the frame limit is refused citing the frames and the limit', async () => {
    const metadata = await threeFrameGifMetadata();

    expect(framesWithin(metadata, { maxFrames: 2, maxPixels: 1e8 }, 'photo')).toEqual({
      ok: false,
      refusal: {
        reason: 'too-many-frames',
        what: 'the photo has 3 frames',
        expected: 'expected at most 2 frames',
      },
    });
  });

  it('pixels counted as width × frame height × frames: 1800 is refused under a 1799 limit', async () => {
    const metadata = await threeFrameGifMetadata();

    expect(framesWithin(metadata, { maxFrames: 120, maxPixels: 1799 }, 'image')).toEqual({
      ok: false,
      refusal: {
        reason: 'too-many-pixels',
        what: 'the image has 1800 pixels across 3 frames',
        expected: 'expected at most 1799',
      },
    });
  });
});

describe('frameHeightOf', () => {
  it('the height of an animation is one page, not the whole strip', async () => {
    expect(frameHeightOf(await threeFrameGifMetadata())).toBe(30);
  });

  it('a still image without pages answers its own height', async () => {
    const png = await sharp({ create: { width: 8, height: 5, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();

    expect(frameHeightOf(await sharp(png).metadata())).toBe(5);
  });
});
