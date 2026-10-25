import type { Metadata } from 'sharp';

/** What an animated input may hold before it is decoded: its frames and its pixels × frames. */
export type FrameLimits = Readonly<{ maxFrames: number; maxPixels: number }>;

/** Why the frames were not let in; each processor words `what` and `expected` into its detail. */
export type FrameRefusal = Readonly<{
  reason: 'too-many-frames' | 'too-many-pixels';
  what: string;
  expected: string;
}>;

export type FramesOutcome =
  Readonly<{ ok: true; frames: number }> | Readonly<{ ok: false; refusal: FrameRefusal }>;

/** Counts the frames of an image from its header and refuses, before anything is decoded, too
 *  many frames or a decompression bomb: an animation decodes every frame, so the budget is
 *  width × frame height × frames, never one frame. Shared by the avatar and the asset processors.
 *
 *  Example: `framesWithin(await sharp(gif).metadata(), { maxFrames: 120, maxPixels: 1e8 }, 'image') // { ok: true, frames: 3 }` */
export function framesWithin(
  metadata: Metadata,
  limits: FrameLimits,
  subject: string,
): FramesOutcome {
  const frames = metadata.pages ?? 1;
  if (frames > limits.maxFrames) {
    const what = `the ${subject} has ${frames} frames`;
    return refused('too-many-frames', what, `expected at most ${limits.maxFrames} frames`);
  }
  const pixels = metadata.width * frameHeightOf(metadata) * frames;
  if (pixels <= limits.maxPixels) return { ok: true, frames };
  const what = `the ${subject} has ${pixels} pixels across ${frames} frames`;
  return refused('too-many-pixels', what, `expected at most ${limits.maxPixels}`);
}

/** The height of one frame: sharp reports an animation as one tall strip of its pages.
 *
 *  Example: `frameHeightOf(await sharp(gif, { animated: true }).metadata()) // 600, not 1800` */
export function frameHeightOf(metadata: Metadata): number {
  return metadata.pageHeight ?? metadata.height;
}

function refused(reason: FrameRefusal['reason'], what: string, expected: string): FramesOutcome {
  return { ok: false, refusal: { reason, what, expected } };
}
