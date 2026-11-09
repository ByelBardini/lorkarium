import { AssetTooLargeError } from './assets.error';
import type { AssetPo } from './assets.po';

export type AssetPurpose = AssetPo['purpose'];

/** Largest side in pixels kept per purpose (the contract's `ASSET_MAX_SIDE`). */
export type SideLimits = Readonly<Record<AssetPurpose, number>>;

/** How an image sent for a purpose is kept: its largest side and whether it is cut square. */
export type AssetResize = Readonly<{ maxSide: number; square: boolean }>;

// The board fills a circle with the condition texture; a square one needs no mask, which would
// break the GPU batch (docs/context/client/performance.md).
const SQUARE_PURPOSES: ReadonlySet<AssetPurpose> = new Set(['condition']);

/** How the server keeps an image sent for `purpose`.
 *
 *  Example: `resizeFor('condition', ASSET_MAX_SIDE) // { maxSide: 256, square: true }` */
export function resizeFor(purpose: AssetPurpose, limits: SideLimits): AssetResize {
  return { maxSide: limits[purpose], square: SQUARE_PURPOSES.has(purpose) };
}

/** How much a kept image may animate (the contract's `AURA_ANIMATION_LIMITS`). */
export type AnimationLimits = Readonly<{ maxFrames: number; maxDecodedPixels: number }>;

// Only the aura moves on the board; a token, a background, a cover or a condition stays still.
const ANIMATED_PURPOSES: ReadonlySet<AssetPurpose> = new Set(['aura']);

/** How much an image sent for `purpose` may keep animating; `null` = it must be still (a GIF is
 *  refused, an animated WebP comes out with its first frame).
 *
 *  Example: `animationFor('aura', AURA_ANIMATION_LIMITS) // { maxFrames: 120, maxDecodedPixels: 16_000_000 }` */
export function animationFor(
  purpose: AssetPurpose,
  limits: AnimationLimits,
): AnimationLimits | null {
  return ANIMATED_PURPOSES.has(purpose) ? limits : null;
}

/** Refuses a file above the byte limit before anything decodes it.
 *
 *  Example: `requireSize(bytes.byteLength, ASSET_MAX_BYTES) // throws ASSET_TOO_LARGE above it` */
export function requireSize(byteLength: number, limit: number): void {
  if (byteLength <= limit) return;
  throw new AssetTooLargeError(limit, byteLength);
}

// Only a token can stand in the way of a line of sight.
const OUTLINED_PURPOSES: ReadonlySet<AssetPurpose> = new Set(['token']);

/** Whether the silhouette of an image sent for `purpose` is traced and kept.
 *
 *  Example: `outlineFor('token') // true` */
export function outlineFor(purpose: AssetPurpose): boolean {
  return OUTLINED_PURPOSES.has(purpose);
}

// Who may read these changes while the id stays the same, so the bytes go through a read policy,
// are never cached and cannot become the art of something every member sees.
const PROTECTED_PURPOSES: ReadonlySet<AssetPurpose> = new Set([
  'library_image',
  'document_image',
  'library_map',
]);

/** Whether an image of `purpose` is reserved to its own feature and read through a policy.
 *
 *  Example: `isProtectedAssetPurpose('library_map') // true` */
export function isProtectedAssetPurpose(purpose: AssetPurpose): boolean {
  return PROTECTED_PURPOSES.has(purpose);
}

const MASTER_ONLY_PURPOSES: ReadonlySet<AssetPurpose> = new Set(['library_image', 'library_map']);

/** Whether only the master may send an image of `purpose`.
 *
 *  Example: `isMasterOnlyAssetPurpose('document_image') // false` */
export function isMasterOnlyAssetPurpose(purpose: AssetPurpose): boolean {
  return MASTER_ONLY_PURPOSES.has(purpose);
}
