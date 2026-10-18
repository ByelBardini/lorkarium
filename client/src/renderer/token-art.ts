import type { TokenFrameDto } from '@lorkarium/contracts';

export type ArtImageSize = Readonly<{ width: number; height: number }>;

/** Where the image sits inside the token's rectangle, in world px from its top-left corner. */
export type ArtBox = Readonly<{ x: number; y: number; width: number; height: number }>;

/** How the image fits a token of `token` px: whole inside it (`square`, contain: a cut-out PNG
 *  keeps its tips), or filling the ellipse (`round`, cover: the mask trims the overflow). The fit is
 *  made on a square and then stretched with the token, so a token stretched by one side stretches
 *  its image and one scaled by a corner keeps it.
 *
 *  Example: `artBox('square', { width: 400, height: 600 }, { width: 64, height: 64 }) // { x: 10.67, y: 0, width: 42.67, height: 64 }` */
export function artBox(frame: TokenFrameDto, image: ArtImageSize, token: ArtImageSize): ArtBox {
  const fit = frame === 'square' ? Math.min : Math.max;
  const scale = fit(1 / image.width, 1 / image.height);
  const width = image.width * scale * token.width;
  const height = image.height * scale * token.height;
  return { x: (token.width - width) / 2, y: (token.height - height) / 2, width, height };
}

/** The scale signs that mirror the image (the flips of the right-click menu).
 *
 *  Example: `flipSigns(true, false) // { x: -1, y: 1 }` */
export function flipSigns(flipX: boolean, flipY: boolean): Readonly<{ x: number; y: number }> {
  return { x: flipX ? -1 : 1, y: flipY ? -1 : 1 };
}
