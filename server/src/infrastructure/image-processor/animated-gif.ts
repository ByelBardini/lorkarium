import sharp from 'sharp';
import type { AnimationBudget, NormalizedImage } from '../../modules/assets/image-processor.port';

export type AnimatedGifTarget = Readonly<{
  maxSide: number;
  animation: AnimationBudget;
  maxInputPixels: number;
}>;

/** Keeps a GIF animated: every frame shrunk to the side the budget allows and re-encoded as a GIF
 *  with the same delays and loop, without any metadata. No `autoOrient`: a GIF has no EXIF.
 *  `null` when the bytes do not decode after all.
 *
 *  Example: `await keptAnimatedGif(gif, 3, { maxSide: 512, animation, maxInputPixels }) // 512 × 512, 3 frames` */
export async function keptAnimatedGif(
  bytes: Uint8Array,
  frames: number,
  target: AnimatedGifTarget,
): Promise<NormalizedImage | null> {
  const side = animatedSideOf(target, frames);
  const output = await sharp(bytes, { animated: true, limitInputPixels: target.maxInputPixels })
    .resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true })
    .gif()
    .toBuffer({ resolveWithObject: true })
    .catch(() => null);
  if (!output) return null;
  const { data, info } = output;
  const height = info.pageHeight ?? info.height;
  return { bytes: new Uint8Array(data), mimeType: 'image/gif', width: info.width, height };
}

// A long GIF keeps every frame and loses resolution instead (100 frames of 16 MP → 400 px).
function animatedSideOf(target: AnimatedGifTarget, frames: number): number {
  const fitting = Math.floor(Math.sqrt(target.animation.maxDecodedPixels / frames));
  return Math.min(target.maxSide, fitting);
}
