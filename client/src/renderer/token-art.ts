import type { TokenFrameDto } from '@lorkarium/contracts';

export type ArtImageSize = Readonly<{ width: number; height: number }>;

/** Where the image sits inside the token's square, in world px from its top-left corner. */
export type ArtBox = Readonly<{ x: number; y: number; width: number; height: number }>;

/** How the image fits a token of `side` px: whole inside the square (`square`, contain: a cut-out
 *  PNG keeps its tips), or filling the circle (`round`, cover: the mask trims the overflow).
 *
 *  Example: `artBox('square', { width: 400, height: 600 }, 64) // { x: 10.67, y: 0, width: 42.67, height: 64 }` */
export function artBox(frame: TokenFrameDto, image: ArtImageSize, side: number): ArtBox {
  const fit = frame === 'square' ? Math.min : Math.max;
  const scale = fit(side / image.width, side / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return { x: (side - width) / 2, y: (side - height) / 2, width, height };
}

/** The scale signs that mirror the image (the flips of the right-click menu).
 *
 *  Example: `flipSigns(true, false) // { x: -1, y: 1 }` */
export function flipSigns(flipX: boolean, flipY: boolean): Readonly<{ x: number; y: number }> {
  return { x: flipX ? -1 : 1, y: flipY ? -1 : 1 };
}
