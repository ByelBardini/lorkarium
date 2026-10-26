/** An image as it is kept: a square WebP cut from the center (animated only when asked and the
 *  input was), without any metadata. */
export type NormalizedAvatar = Readonly<{ bytes: Uint8Array; frames: number }>;

/** The square asked for: its side in pixels and whether an animation stays animated (a still
 *  shape keeps only the first frame). The photo is `{ side: 256, animated: true }`, the dice
 *  texture `{ side: 512, animated: false }`. */
export type ImageShape = Readonly<{ side: number; animated: boolean }>;

/** Why bytes were not kept; `detail` cites what was received and what was expected. */
export type AvatarRefusal = Readonly<{
  reason: 'not-an-image' | 'format' | 'too-many-pixels' | 'too-many-frames';
  detail: string;
}>;

export type AvatarOutcome =
  | Readonly<{ ok: true; avatar: NormalizedAvatar }>
  | Readonly<{ ok: false; refusal: AvatarRefusal }>;

/** Proves the bytes are a PNG, JPEG, WebP or GIF (animated included) and rewrites them as the
 *  square WebP of `shape` the app serves (§8.5); anything else comes back as a refusal, never
 *  thrown. */
export interface AvatarProcessorPort {
  normalize(bytes: Uint8Array, shape: ImageShape): Promise<AvatarOutcome>;
}
