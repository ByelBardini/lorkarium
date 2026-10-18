import type { SceneDto } from '@lorkarium/contracts';
import type { EffectArea } from '@lorkarium/game-core';
import { cellsText } from './cells-text';
import { rulerLabel } from './ruler-label';

type SceneDistance = Pick<SceneDto, 'cellDistance' | 'cellUnit'>;

const REACH_WORD: Readonly<Record<Exclude<EffectArea['kind'], 'square'>, string>> = {
  circle: 'Raio',
  smooth_circle: 'Raio',
  semicircle: 'Raio',
  smooth_semicircle: 'Raio',
  orthogonal_cone: 'Cone',
  diagonal_cone: 'Cone',
  line: 'Linha',
  emanation: 'Emanação',
};

/** The size of an area in cells and in the scene's own distance, as the ruler reads:
 *  "Cone 3 casas · 4,5 m", "3 × 2 casas · 4,5 × 3 m".
 *
 *  Example: `effectAreaLabel(circleOfReach4, scene) // 'Raio 4 casas · 6 m'` */
export function effectAreaLabel(area: EffectArea, scene: SceneDistance): string {
  if (area.kind === 'square') return squareLabel(area.width, area.height, scene);
  return `${REACH_WORD[area.kind]} ${rulerLabel(area.reach, scene)}`;
}

/** Only the size, without the word of the shape: "3 casas · 4,5 m".
 *
 *  Example: `effectAreaSize(cone, scene) // '3 casas · 4,5 m'` */
export function effectAreaSize(area: EffectArea, scene: SceneDistance): string {
  if (area.kind === 'square') return squareLabel(area.width, area.height, scene);
  return rulerLabel(area.reach, scene);
}

function squareLabel(width: number, height: number, scene: SceneDistance): string {
  const distance = (cells: number): string => cellsText(round(cells * scene.cellDistance));
  const cells = `${cellsText(width)} × ${cellsText(height)} casas`;
  return `${cells} · ${distance(width)} × ${distance(height)} ${scene.cellUnit}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
