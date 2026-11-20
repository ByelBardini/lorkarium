import type { ScreenshotDto } from '@lorkarium/contracts';
import type { ImageProcessorPort, NormalizedImage } from './image-processor.port';

/** The types a screenshot is kept as: the processor only keeps a GIF animated when asked. */
export const SCREENSHOT_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type ScreenshotMimeType = (typeof SCREENSHOT_MIME_TYPES)[number];

/** How big a screenshot may arrive and the side it is kept at. */
export type ScreenshotLimits = Readonly<{ maxBytes: number; maxSide: number }>;

/** The module's own errors for each refusal, so its edge keeps its codes. */
export type ScreenshotRefusals = Readonly<{
  tooLarge: (maxBytes: number, sizeBytes: number) => Error;
  unsupported: (detail: string) => Error;
}>;

export type ScreenshotKeeping = Readonly<{
  processor: ImageProcessorPort;
  limits: ScreenshotLimits;
}>;

export type KeptScreenshot = Readonly<{ image: NormalizedImage; mimeType: ScreenshotMimeType }>;

/** A screenshot as it is kept (a report's or a feedback's): size checked before decoding, EXIF
 *  gone, the opaque one as WebP, and the type one of `SCREENSHOT_MIME_TYPES`.
 *
 *  Example: `await keptScreenshotOf(bytes, { processor, limits }, refusals) // { image, mimeType: 'image/webp' }` */
export async function keptScreenshotOf(
  bytes: Uint8Array,
  keeping: ScreenshotKeeping,
  refusals: ScreenshotRefusals,
): Promise<KeptScreenshot> {
  const { maxBytes, maxSide } = keeping.limits;
  if (bytes.byteLength > maxBytes) throw refusals.tooLarge(maxBytes, bytes.byteLength);
  const outcome = await keeping.processor.normalize(bytes, { maxSide, opaqueAsWebp: true });
  if (!outcome.ok) throw refusals.unsupported(`screenshot refused: ${outcome.refusal.detail}`);
  return { image: outcome.image, mimeType: keptTypeOf(outcome.image.mimeType, refusals) };
}

/** A kept screenshot row, whatever module keeps it. */
export type ScreenshotRow = Readonly<{
  id: string;
  mimeType: ScreenshotMimeType;
  width: number;
  height: number;
  sizeBytes: number;
}>;

/** Example: `screenshotDtoOf(row) // { id, mimeType: 'image/webp', width, height, sizeBytes }` */
export function screenshotDtoOf(row: ScreenshotRow): ScreenshotDto {
  const { id, mimeType, width, height, sizeBytes } = row;
  return { id, mimeType, width, height, sizeBytes };
}

function keptTypeOf(mimeType: string, refusals: ScreenshotRefusals): ScreenshotMimeType {
  const kept = SCREENSHOT_MIME_TYPES.find((type) => type === mimeType);
  if (kept !== undefined) return kept;
  throw refusals.unsupported(
    `screenshot kept as ${mimeType}: expected ${SCREENSHOT_MIME_TYPES.join(', ')}`,
  );
}
