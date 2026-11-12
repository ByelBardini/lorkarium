import { AssetTooLargeError, InvalidCropError, UnsupportedFontError } from './assets.error';
import type { AssetPo } from './assets.po';
import type { ImageAspect, ImageCrop, ImageFrame } from './image-processor.port';

export type AssetPurpose = AssetPo['purpose'];

/** Largest side in pixels kept per purpose (the contract's `ASSET_MAX_SIDE`). */
export type SideLimits = Readonly<Record<AssetPurpose, number>>;

/** How an image sent for a purpose is kept: its largest side. */
export type AssetResize = Readonly<{ maxSide: number }>;

/** The aspect each framed purpose is kept in (the contract's `ASSET_FRAME`). */
export type FrameAspects = Readonly<Partial<Record<AssetPurpose, ImageAspect>>>;

// The board fills a circle with the condition texture; a square one needs no mask, which would
// break the GPU batch (docs/context/client/performance.md). Its square is always the centre.
const CENTRED_SQUARE: ImageFrame = { aspect: { width: 1, height: 1 }, crop: null };

/** How large the server keeps an image sent for `purpose`.
 *
 *  Example: `resizeFor('condition', ASSET_MAX_SIDE) // { maxSide: 256 }` */
export function resizeFor(purpose: AssetPurpose, limits: SideLimits): AssetResize {
  return { maxSide: limits[purpose] };
}

/** The frame an image sent for `purpose` is cut to: its aspect in `aspects` inside `crop` (the
 *  centre when `null`), the centred square of a condition, or `null` (kept in its shape). A
 *  rectangle sent for a purpose with no aspect of its own is refused.
 *
 *  Example: `frameFor('campaign_banner', { x: 0, y: 25, w: 100, h: 33 }, ASSET_FRAME) // { aspect: 3:1, crop }` */
export function frameFor(
  purpose: AssetPurpose,
  crop: ImageCrop | null,
  aspects: FrameAspects,
): ImageFrame | null {
  const aspect = aspects[purpose];
  if (aspect) return { aspect: { width: aspect.width, height: aspect.height }, crop };
  if (crop !== null) throw new InvalidCropError(purpose, crop, Object.keys(aspects));
  return purpose === 'condition' ? CENTRED_SQUARE : null;
}

/** How much a kept image may animate (the contract's `AURA_ANIMATION_LIMITS`). */
export type AnimationLimits = Readonly<{ maxFrames: number; maxDecodedPixels: number }>;

// The aura moves on the board and a sheet image in its frame; a token, a background, a cover or a
// condition stays still (its GIF keeps the first frame).
const ANIMATED_PURPOSES: ReadonlySet<AssetPurpose> = new Set(['aura', 'sheet_image']);

/** How much an image sent for `purpose` may keep animating; `null` = it must be still (a GIF or
 *  an animated WebP comes out with its first frame).
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

// The big pictures behind the board: an opaque PNG of them weighs ~3× a WebP with no visible
// gain, in download and in VRAM decode. A transparent one stays PNG.
const OPAQUE_AS_WEBP_PURPOSES: ReadonlySet<AssetPurpose> = new Set([
  'background',
  'library_image',
  'library_map',
]);

/** Whether an opaque image sent for `purpose` is kept as WebP whatever format it came in.
 *
 *  Example: `opaqueAsWebpFor('background') // true` */
export function opaqueAsWebpFor(purpose: AssetPurpose): boolean {
  return OPAQUE_AS_WEBP_PURPOSES.has(purpose);
}

// Who may read these changes while the id stays the same, so the bytes go through a read policy,
// are never cached and cannot become the art of something every member sees.
const PROTECTED_PURPOSES: ReadonlySet<AssetPurpose> = new Set([
  'library_image',
  'document_image',
  'sheet_image',
  'sheet_template_asset',
  'library_map',
]);

/** Whether an image of `purpose` is reserved to its own feature and read through a policy.
 *
 *  Example: `isProtectedAssetPurpose('library_map') // true` */
export function isProtectedAssetPurpose(purpose: AssetPurpose): boolean {
  return PROTECTED_PURPOSES.has(purpose);
}

// Sent only by the route of what they belong to, which authorizes and associates them.
const DEDICATED_ENDPOINTS: Readonly<Partial<Record<AssetPurpose, string>>> = {
  document_image: 'the document image endpoint',
  sheet_image: 'the sheet image endpoint',
  sheet_template_asset: 'the sheet template asset endpoint',
};

/** The only endpoint that may send an image of `purpose`; `null` = the generic asset routes.
 *
 *  Example: `dedicatedEndpointOf('sheet_image') // 'the sheet image endpoint'` */
export function dedicatedEndpointOf(purpose: AssetPurpose): string | null {
  return DEDICATED_ENDPOINTS[purpose] ?? null;
}

const MASTER_ONLY_PURPOSES: ReadonlySet<AssetPurpose> = new Set([
  'library_image',
  'library_map',
  'sheet_template_asset',
]);

/** Whether only the master may send an image of `purpose`.
 *
 *  Example: `isMasterOnlyAssetPurpose('document_image') // false` */
export function isMasterOnlyAssetPurpose(purpose: AssetPurpose): boolean {
  return MASTER_ONLY_PURPOSES.has(purpose);
}

// Every WOFF2 file starts with these four bytes ("wOF2"); a TTF, an OTF or a WOFF 1 does not.
const WOFF2_SIGNATURE = [0x77, 0x4f, 0x46, 0x32] as const;

/** Refuses bytes that are not a WOFF2 font, by their signature (never the name nor the type
 *  the sender claimed).
 *
 *  Example: `requireWoff2(bytes) // throws UNSUPPORTED_FONT for a TTF renamed .woff2` */
export function requireWoff2(bytes: Uint8Array): void {
  if (WOFF2_SIGNATURE.every((byte, at) => bytes[at] === byte)) return;
  const head = Array.from(bytes.slice(0, 4), (byte) => byte.toString(16).padStart(2, '0')).join(
    ' ',
  );
  throw new UnsupportedFontError(
    `the ${bytes.byteLength} bytes start with ${head || 'nothing'}; expected a WOFF2 font (77 4f 46 32)`,
  );
}
