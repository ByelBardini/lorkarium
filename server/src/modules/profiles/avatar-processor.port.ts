/** The photo as it is kept: a 256 × 256 WebP cut from the center (animated when the input was),
 *  without any metadata. */
export type NormalizedAvatar = Readonly<{ bytes: Uint8Array; frames: number }>;

/** Why bytes were not kept; `detail` cites what was received and what was expected. */
export type AvatarRefusal = Readonly<{
  reason: 'not-an-image' | 'format' | 'too-many-pixels' | 'too-many-frames';
  detail: string;
}>;

export type AvatarOutcome =
  | Readonly<{ ok: true; avatar: NormalizedAvatar }>
  | Readonly<{ ok: false; refusal: AvatarRefusal }>;

/** Proves the bytes are a PNG, JPEG, WebP or GIF (animated included) and rewrites them as the
 *  square WebP the app serves (§8.5); anything else comes back as a refusal, never thrown. */
export interface AvatarProcessorPort {
  normalize(bytes: Uint8Array): Promise<AvatarOutcome>;
}
