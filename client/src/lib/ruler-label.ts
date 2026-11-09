import type { SceneDto } from '@lorkarium/contracts';

const NUMBER_FORMAT: Readonly<Record<RulerDecimals, Intl.NumberFormat>> = {
  1: new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }),
  2: new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }),
};

/** How many decimals a reading shows: one on a free-movement grid, where 1/64 steps would read as noise. */
export type RulerDecimals = 1 | 2;

/** The ruler's reading in cells and in the scene's own distance: "3 casas · 4,5 m".
 *
 *  Example: `rulerLabel(cellDistance(from, to), scene, scene.freeMovement ? 1 : 2)` */
export function rulerLabel(
  cells: number,
  scene: Pick<SceneDto, 'cellDistance' | 'cellUnit'>,
  decimals: RulerDecimals = 2,
): string {
  const format = NUMBER_FORMAT[decimals];
  const shown = format.format(cells);
  const count = `${shown} ${shown === '1' ? 'casa' : 'casas'}`;
  return `${count} · ${format.format(cells * scene.cellDistance)} ${scene.cellUnit}`;
}
