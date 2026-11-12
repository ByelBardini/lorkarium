import type { ImageAspect, ImageCrop } from '../../modules/assets/image-processor.port';

/** The size of an image in pixels, as it stands upright. */
export type ImageSize = Readonly<{ width: number; height: number }>;

/** A box in whole pixels, shaped as sharp's `extract` takes it. */
export type PixelBox = Readonly<{ left: number; top: number; width: number; height: number }>;

type Span = Readonly<{ start: number; length: number }>;

const WHOLE_IMAGE: ImageCrop = { x: 0, y: 0, w: 100, h: 100 };

/** The pixels cut out of an image of `size` for a frame of `aspect`: the crop (percent of the
 *  image) turned into pixels, then the largest box of the aspect centred in it. Without a crop it
 *  is centred in the whole image. The box never leaves the image and is at least 1 px each way.
 *
 *  Example: `frameBoxOf({ width: 1000, height: 500 }, { width: 3, height: 1 }, null) // { left: 0, top: 83, width: 1000, height: 333 }` */
export function frameBoxOf(size: ImageSize, aspect: ImageAspect, crop: ImageCrop | null): PixelBox {
  const area = crop ?? WHOLE_IMAGE;
  const across = spanOf(area.x, area.w, size.width);
  const down = spanOf(area.y, area.h, size.height);
  const fitted = fittedSizeOf({ width: across.length, height: down.length }, aspect);
  return {
    left: across.start + Math.floor((across.length - fitted.width) / 2),
    top: down.start + Math.floor((down.length - fitted.height) / 2),
    ...fitted,
  };
}

// A crop from the client is rounded, so it may poke a pixel past the edge or round to nothing.
function spanOf(startPercent: number, lengthPercent: number, side: number): Span {
  const start = clamp(Math.round((startPercent * side) / 100), 0, side - 1);
  const end = clamp(Math.round(((startPercent + lengthPercent) * side) / 100), start + 1, side);
  return { start, length: end - start };
}

function fittedSizeOf(room: ImageSize, aspect: ImageAspect): ImageSize {
  if (room.width * aspect.height > room.height * aspect.width) {
    const width = Math.round((room.height * aspect.width) / aspect.height);
    return { width: clamp(width, 1, room.width), height: room.height };
  }
  const height = Math.round((room.width * aspect.height) / aspect.width);
  return { width: room.width, height: clamp(height, 1, room.height) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
