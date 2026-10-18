import { AssetTooLargeError } from './assets.error';
import type { AssetPo } from './assets.po';

export type AssetPurpose = AssetPo['purpose'];

/** Largest side in pixels kept per purpose (the contract's `ASSET_MAX_SIDE`). */
export type SideLimits = Readonly<Record<AssetPurpose, number>>;

/** The largest side the server keeps for an image sent for `purpose`.
 *
 *  Example: `maxSideFor('token', ASSET_MAX_SIDE) // 1024` */
export function maxSideFor(purpose: AssetPurpose, limits: SideLimits): number {
  return limits[purpose];
}

/** Refuses a file above the byte limit before anything decodes it.
 *
 *  Example: `requireSize(bytes.byteLength, ASSET_MAX_BYTES) // throws ASSET_TOO_LARGE above it` */
export function requireSize(byteLength: number, limit: number): void {
  if (byteLength <= limit) return;
  throw new AssetTooLargeError(limit, byteLength);
}
