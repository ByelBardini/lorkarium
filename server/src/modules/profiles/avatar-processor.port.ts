/** An image as it is kept: a WebP of the asked size cut from the center (animated only when asked and the
 *  input was), without any metadata. */
export type NormalizedAvatar = Readonly<{ bytes: Uint8Array; frames: number }>;

import type { ImageCrop } from '../assets/image-processor.port';

/** The rectangle asked for: its size in pixels, whether an animation stays animated (a still
 *  shape keeps only the first frame) and, optionally, the part of the image (percent of the
 *  upright image) the shape is cut inside instead of the center. The photo is
 *  `{ width: 256, height: 256, animated: true }`, the dice texture a still 512 square and the
 *  banner an 1800 × 600 with the rectangle picked in the crop dialog. */
export type ImageShape = Readonly<{
  width: number;
  height: number;
  animated: boolean;
  crop?: ImageCrop | null;
}>;

/** Why bytes were not kept; `detail` cites what was received and what was expected. */
export type AvatarRefusal = Readonly<{
  reason: 'not-an-image' | 'format' | 'too-many-pixels' | 'too-many-frames';
  detail: string;
}>;

export type AvatarOutcome =
  | Readonly<{ ok: true; avatar: NormalizedAvatar }>
  | Readonly<{ ok: false; refusal: AvatarRefusal }>;

/** Proves the bytes are a PNG, JPEG, WebP or GIF (animated included) and rewrites them as the
 *  WebP of `shape` the app serves (§8.5); anything else comes back as a refusal, never
 *  thrown. */
export interface AvatarProcessorPort {
  normalize(bytes: Uint8Array, shape: ImageShape): Promise<AvatarOutcome>;
}
