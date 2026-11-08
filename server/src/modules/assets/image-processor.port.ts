import type { AssetMimeTypeDto } from '@lorkarium/contracts';

/** The silhouette of a kept image: polygons of `[x, y]` in a unit square, where the image sits
 *  contained. Empty = nothing in it is solid enough. */
export type ImageOutline = readonly (readonly (readonly [number, number])[])[];

/** The image as it is kept: decoded, re-encoded in its own format, without metadata. `outline` is
 *  `null` unless it was asked for and the image is a still one. */
export type NormalizedImage = Readonly<{
  bytes: Uint8Array;
  mimeType: AssetMimeTypeDto;
  width: number;
  height: number;
  outline: ImageOutline | null;
}>;

/** Why bytes were not kept; `detail` cites what was received, for the log and the error. */
export type ImageRefusal = Readonly<{
  reason: 'not-an-image' | 'format' | 'too-many-pixels' | 'too-many-frames';
  detail: string;
}>;

export type NormalizeOutcome =
  Readonly<{ ok: true; image: NormalizedImage }> | Readonly<{ ok: false; refusal: ImageRefusal }>;

/** How much a GIF may keep moving: at most `maxFrames`, and width × height × frames of the kept
 *  animation at most `maxDecodedPixels` (the side shrinks to fit it, the frames never drop). */
export type AnimationBudget = Readonly<{ maxFrames: number; maxDecodedPixels: number }>;

/** How the image is kept: no side above `maxSide`; `square` cuts the centre square out of it;
 *  `animation` lets a GIF in and keeps it animated within the budget (absent: GIF is refused);
 *  `outline` also traces the silhouette of what was kept. */
export type NormalizeOptions = Readonly<{
  maxSide: number;
  square?: boolean;
  animation?: AnimationBudget;
  outline?: boolean;
}>;

/** Proves the bytes are a PNG, JPEG or WebP (or a GIF, when `animation` is given) and rewrites
 *  them no larger than `maxSide` (§8.5), cut to a centred square when `square`; anything else
 *  comes back as a refusal, never thrown. */
export interface ImageProcessorPort {
  normalize(bytes: Uint8Array, options: NormalizeOptions): Promise<NormalizeOutcome>;
}
