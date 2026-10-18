import { SCENE_CELLS_MAX, SCENE_CELLS_MIN } from '@lorkarium/contracts';

export type ImageSize = Readonly<{ width: number; height: number }>;
export type SceneCells = Readonly<{ widthCells: number; heightCells: number }>;

function clampCells(cells: number): number {
  return Math.min(SCENE_CELLS_MAX, Math.max(SCENE_CELLS_MIN, Math.round(cells)));
}

/** The height in cells that keeps the image's proportion for `widthCells`.
 *
 *  Example: `heightForWidth({ width: 1400, height: 700 }, 30) // 15` */
export function heightForWidth(image: ImageSize, widthCells: number): number {
  return clampCells((widthCells * image.height) / image.width);
}

/** The width in cells that keeps the image's proportion for `heightCells`.
 *
 *  Example: `widthForHeight({ width: 1400, height: 700 }, 10) // 20` */
export function widthForHeight(image: ImageSize, heightCells: number): number {
  return clampCells((heightCells * image.width) / image.height);
}

/** The cells a scene takes for a newly chosen image: the width it has, the height from the
 *  proportion; a height past the limit stops at it and the width follows.
 *
 *  Example: `cellsForImage({ width: 500, height: 5000 }, 20) // { widthCells: 10, heightCells: 100 }` */
export function cellsForImage(image: ImageSize, widthCells: number): SceneCells {
  const exactHeight = (widthCells * image.height) / image.width;
  if (Math.round(exactHeight) <= SCENE_CELLS_MAX) {
    return { widthCells, heightCells: clampCells(exactHeight) };
  }
  return { widthCells: widthForHeight(image, SCENE_CELLS_MAX), heightCells: SCENE_CELLS_MAX };
}

/** Whether the cells follow the image (as rounded by `heightForWidth`); a stretched scene is not.
 *
 *  Example: `isProportional({ widthCells: 30, heightCells: 10 }, { width: 1400, height: 700 }) // false` */
export function isProportional(cells: SceneCells, image: ImageSize): boolean {
  return heightForWidth(image, cells.widthCells) === cells.heightCells;
}
