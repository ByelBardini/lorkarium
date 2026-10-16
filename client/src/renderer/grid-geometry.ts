import { cell, type Cell, type SceneSize } from '@lorkarium/game-core';
import { CELL_WORLD_SIZE, screenToWorld, type Camera, type Point, type Size } from './camera';

export type WorldRect = Readonly<{ x: number; y: number; width: number; height: number }>;

export type GridLines = Readonly<{ vertical: readonly number[]; horizontal: readonly number[] }>;

/** The part of the world the viewport shows through the camera.
 *
 *  Example: `gridLines(scene, visibleWorldRect(camera, { width: canvas.width, height: canvas.height }))` */
export function visibleWorldRect(camera: Camera, viewport: Size): WorldRect {
  const topLeft = screenToWorld(camera, { x: 0, y: 0 });
  return {
    ...topLeft,
    width: viewport.width / camera.zoom,
    height: viewport.height / camera.zoom,
  };
}

/** The world x of each vertical grid line and the world y of each horizontal one inside `visible`:
 *  only what is on screen is drawn, so a 100×100 scene costs the same as a 10×10 one.
 *
 *  Example: `gridLines({ widthCells: 20, heightCells: 12 }, visibleWorldRect(camera, viewport))` */
export function gridLines(scene: SceneSize, visible: WorldRect): GridLines {
  // A vertical line spans the scene height: off screen when the view misses that height.
  const seesRows = overlaps(scene.heightCells, visible.y, visible.height);
  const seesCols = overlaps(scene.widthCells, visible.x, visible.width);
  return {
    vertical: seesRows ? linesWithin(scene.widthCells, visible.x, visible.width) : [],
    horizontal: seesCols ? linesWithin(scene.heightCells, visible.y, visible.height) : [],
  };
}

function overlaps(cells: number, start: number, length: number): boolean {
  return start <= cells * CELL_WORLD_SIZE && start + length >= 0;
}

/** The cell under a world point, or `null` outside the scene; the far edge belongs to the last cell.
 *
 *  Example: `cellAtWorld(scene, screenToWorld(camera, pointer)) // cell(3, 4)` */
export function cellAtWorld(scene: SceneSize, point: Point): Cell | null {
  const col = cellIndexOf(point.x, scene.widthCells);
  const row = cellIndexOf(point.y, scene.heightCells);
  if (col === null || row === null) return null;
  return cell(col, row);
}

function linesWithin(cells: number, start: number, length: number): number[] {
  const first = Math.max(0, Math.ceil(start / CELL_WORLD_SIZE));
  const last = Math.min(cells, Math.floor((start + length) / CELL_WORLD_SIZE));
  const lines: number[] = [];
  for (let index = first; index <= last; index += 1) lines.push(index * CELL_WORLD_SIZE);
  return lines;
}

function cellIndexOf(world: number, cells: number): number | null {
  if (world < 0 || world > cells * CELL_WORLD_SIZE) return null;
  return Math.min(Math.floor(world / CELL_WORLD_SIZE), cells - 1);
}
