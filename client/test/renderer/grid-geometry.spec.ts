import { cell } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { cellAtWorld, gridLines, visibleWorldRect } from '@/renderer/grid-geometry';

const SCENE = { widthCells: 20, heightCells: 12 };
const C = CELL_WORLD_SIZE;

describe('gridLines', () => {
  it('a view over the whole scene has every line, 21 vertical and 13 horizontal', () => {
    const lines = gridLines(SCENE, { x: -100, y: -100, width: 30 * C, height: 20 * C });
    expect(lines.vertical).toHaveLength(21);
    expect(lines.horizontal).toHaveLength(13);
    expect(lines.vertical[0]).toBe(0);
    expect(lines.vertical.at(-1)).toBe(20 * C);
  });

  it('a view of cells 2 to 4 gets only the lines it shows', () => {
    const lines = gridLines(SCENE, { x: 2 * C + 1, y: 0, width: 2 * C, height: C });
    expect(lines.vertical).toEqual([3 * C, 4 * C]);
    expect(lines.horizontal).toEqual([0, C]);
  });

  it('a view outside the scene has no lines', () => {
    expect(gridLines(SCENE, { x: 30 * C, y: 0, width: C, height: C })).toEqual({
      vertical: [],
      horizontal: [],
    });
  });
});

describe('cellAtWorld', () => {
  it('a point rounds down to the cell it is in', () => {
    expect(cellAtWorld(SCENE, { x: 3 * C + 63.9, y: 4 * C })).toEqual(cell(3, 4));
  });

  it('a point on the far edge of the last cell is still inside it', () => {
    expect(cellAtWorld(SCENE, { x: 20 * C, y: 12 * C })).toEqual(cell(19, 11));
  });

  it.each([
    [-1, 0],
    [0, -0.5],
    [20 * C + 1, 0],
    [0, 12 * C + 1],
  ])('a point at (%s, %s) outside the scene is no cell', (x, y) => {
    expect(cellAtWorld(SCENE, { x, y })).toBeNull();
  });
});

describe('visibleWorldRect', () => {
  it('is the viewport seen through the camera', () => {
    const camera = { offsetX: 100, offsetY: 50, zoom: 2 };
    expect(visibleWorldRect(camera, { width: 800, height: 600 })).toEqual({
      x: -50,
      y: -25,
      width: 400,
      height: 300,
    });
  });
});
