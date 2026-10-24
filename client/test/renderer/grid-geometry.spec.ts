import { cell } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { cellAtWorld, gridBandFor, gridLines, visibleWorldRect } from '@/renderer/grid-geometry';

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

describe('gridBandFor', () => {
  const WIDE = { widthCells: 100, heightCells: 100 };
  const screenAt = (x: number, y = 0) => ({ x, y, width: 640, height: 640 });

  it('a 640 px screen at zoom 1 gets the band of one screen of margin, cut at the scene', () => {
    expect(gridBandFor(WIDE, screenAt(0), null)).toEqual({
      colFrom: 0,
      colTo: 20,
      rowFrom: 0,
      rowTo: 20,
    });
  });

  it('in the middle of the scene the band spans a screen on each side', () => {
    expect(gridBandFor(WIDE, screenAt(20 * C, 20 * C), null)).toEqual({
      colFrom: 10,
      colTo: 40,
      rowFrom: 10,
      rowTo: 40,
    });
  });

  it('a pan of 100 px keeps the very same band', () => {
    const band = gridBandFor(WIDE, screenAt(0), null);
    expect(gridBandFor(WIDE, screenAt(100), band)).toBe(band);
  });

  it('a pan of 700 px leaves the band: a new one around the new view', () => {
    const band = gridBandFor(WIDE, screenAt(0), null);
    const next = gridBandFor(WIDE, screenAt(700), band);
    expect(next).not.toBe(band);
    expect(next).toMatchObject({ colFrom: 0, colTo: 31 });
  });

  it('at the far edge the band stops at the last line of the scene', () => {
    expect(gridBandFor(SCENE, screenAt(15 * C), null)).toMatchObject({ colFrom: 5, colTo: 20 });
  });

  it('the lines of a band are those inside it', () => {
    const band = gridBandFor(WIDE, screenAt(20 * C, 20 * C), null);
    const lines = gridLines(WIDE, {
      x: band.colFrom * C,
      y: band.rowFrom * C,
      width: (band.colTo - band.colFrom) * C,
      height: (band.rowTo - band.rowFrom) * C,
    });
    expect(lines.vertical).toHaveLength(31);
    expect(lines.vertical[0]).toBe(10 * C);
  });
});
