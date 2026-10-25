import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { keptAnimatedGif } from '../../../src/infrastructure/image-processor/animated-gif';

async function gifOf(frames: number, side: number): Promise<Uint8Array> {
  const colours = [
    { r: 255, g: 0, b: 0 },
    { r: 0, g: 0, b: 255 },
  ];
  const pictures = await Promise.all(
    Array.from({ length: frames }, (_, index) =>
      sharp({
        create: {
          width: side,
          height: side,
          channels: 3,
          background: colours[index % 2] ?? '#f00',
        },
      })
        .png()
        .toBuffer(),
    ),
  );
  return new Uint8Array(
    await sharp(pictures, { join: { animated: true } })
      .gif()
      .toBuffer(),
  );
}

function targetOf(maxDecodedPixels: number) {
  return { maxSide: 512, animation: { maxFrames: 120, maxDecodedPixels }, maxInputPixels: 1e8 };
}

describe('keptAnimatedGif', () => {
  it('4 frames under a 10 000-pixel budget are kept at 50 × 50 each (√(10 000 / 4))', async () => {
    const image = await keptAnimatedGif(await gifOf(4, 200), 4, targetOf(10_000));

    expect(image).toMatchObject({ mimeType: 'image/gif', width: 50, height: 50 });
    expect((await sharp(image?.bytes, { animated: true }).metadata()).pages).toBe(4);
  });

  it('a 64 × 64 GIF far under the budget is never enlarged to the 512 side', async () => {
    const image = await keptAnimatedGif(await gifOf(2, 64), 2, targetOf(16_000_000));

    expect(image).toMatchObject({ width: 64, height: 64 });
  });

  it('bytes that do not decode as a GIF answer null', async () => {
    const junk = new Uint8Array(Buffer.from('GIF89a but not really'));

    expect(await keptAnimatedGif(junk, 2, targetOf(16_000_000))).toBeNull();
  });
});
