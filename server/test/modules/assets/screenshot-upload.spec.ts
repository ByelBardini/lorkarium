import { beforeEach, describe, expect, it } from 'vitest';
import {
  keptScreenshotOf,
  type ScreenshotRefusals,
} from '../../../src/modules/assets/screenshot-upload';
import { ImageProcessorFake } from '../../support/assets-fakes';

const MAX_BYTES = 5 * 1024 * 1024;
const LIMITS = { maxBytes: MAX_BYTES, maxSide: 4096 };

class ScreenshotRefusedError extends Error {
  constructor(
    readonly kind: 'too-large' | 'unsupported',
    message: string,
  ) {
    super(message);
  }
}

const REFUSALS: ScreenshotRefusals = {
  tooLarge: (maxBytes, sizeBytes) =>
    new ScreenshotRefusedError('too-large', `${sizeBytes} bytes over ${maxBytes} bytes`),
  unsupported: (detail) => new ScreenshotRefusedError('unsupported', detail),
};

let processor: ImageProcessorFake;

beforeEach(() => {
  processor = new ImageProcessorFake();
});

describe('keptScreenshotOf', () => {
  it('normalizes at the max side, opaque as WebP, and keeps the type the processor gave', async () => {
    processor.result = { ...processor.result, mimeType: 'image/webp' };

    const kept = await keptScreenshotOf(
      new Uint8Array(10),
      { processor, limits: LIMITS },
      REFUSALS,
    );

    expect(kept.mimeType).toBe('image/webp');
    expect(kept.image).toBe(processor.result);
    expect(processor.resizes).toEqual([{ maxSide: 4096, opaqueAsWebp: true }]);
  });

  it('a body of exactly the max passes and one byte more is refused before decoding, citing both', async () => {
    await expect(
      keptScreenshotOf(new Uint8Array(MAX_BYTES), { processor, limits: LIMITS }, REFUSALS),
    ).resolves.toMatchObject({ mimeType: 'image/png' });

    await expect(
      keptScreenshotOf(new Uint8Array(MAX_BYTES + 1), { processor, limits: LIMITS }, REFUSALS),
    ).rejects.toMatchObject({ kind: 'too-large', message: '5242881 bytes over 5242880 bytes' });
    expect(processor.resizes).toHaveLength(1);
  });

  it('an image the processor cannot decode is unsupported with its detail', async () => {
    processor.refusal = { reason: 'not-an-image', detail: 'not an image' };

    await expect(
      keptScreenshotOf(new Uint8Array(10), { processor, limits: LIMITS }, REFUSALS),
    ).rejects.toMatchObject({
      kind: 'unsupported',
      message: expect.stringContaining('not an image'),
    });
  });

  it('an animated GIF kept as such is unsupported citing the type', async () => {
    processor.result = { ...processor.result, mimeType: 'image/gif' };

    await expect(
      keptScreenshotOf(new Uint8Array(10), { processor, limits: LIMITS }, REFUSALS),
    ).rejects.toMatchObject({ kind: 'unsupported', message: expect.stringContaining('image/gif') });
  });
});
