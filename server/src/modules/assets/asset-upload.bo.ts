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

/** Refuses a file above the byte limit before anything decodes it.
 *
 *  Example: `requireSize(bytes.byteLength, ASSET_MAX_BYTES) // throws ASSET_TOO_LARGE above it` */
export function requireSize(byteLength: number, limit: number): void {
  if (byteLength <= limit) return;
  throw new AssetTooLargeError(limit, byteLength);
}
