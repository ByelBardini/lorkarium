import type { SceneDto } from '@lorkarium/contracts';

const NUMBER_FORMAT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** The ruler's reading in cells and in the scene's own distance: "3 casas · 4,5 m".
 *
 *  Example: `rulerLabel(cellDistance(from, to), scene)` */
export function rulerLabel(
  cells: number,
  scene: Pick<SceneDto, 'cellDistance' | 'cellUnit'>,
): string {
  const count = `${NUMBER_FORMAT.format(cells)} ${cells === 1 ? 'casa' : 'casas'}`;
  return `${count} · ${NUMBER_FORMAT.format(cells * scene.cellDistance)} ${scene.cellUnit}`;
}
