import { describe, expect, it } from 'vitest';
import { resizeTokenBox, type TokenBox } from '../src/token-resize';

const SCENE = { widthCells: 20, heightCells: 12 };

function box(col: number, row: number, width: number, height: number): TokenBox {
  return { col, row, width, height };
}

describe('resizeTokenBox — sides stretch one axis', () => {
  it('the east handle dragged 1.2 cells widens a 1×1 to 2×1 (snapped to half a cell)', () => {
    expect(resizeTokenBox(SCENE, box(3, 3, 1, 1), 'e', { x: 1.2, y: 5 })).toEqual(box(3, 3, 2, 1));
  });

  it('the west handle dragged one cell left moves the origin and keeps the east side fixed', () => {
    expect(resizeTokenBox(SCENE, box(3, 3, 2, 2), 'w', { x: -1, y: 0 })).toEqual(box(2, 3, 3, 2));
  });

  it('the north handle shrinking past the minimum stops at half a cell, never flips', () => {
    expect(resizeTokenBox(SCENE, box(3, 3, 2, 2), 'n', { x: 0, y: 4 })).toEqual(
      box(3, 4.5, 2, 0.5),
    );
  });

  it('the south handle stops at ten cells', () => {
    const tall = resizeTokenBox({ widthCells: 40, heightCells: 40 }, box(0, 0, 1, 2), 's', {
      x: 0,
      y: 30,
    });
    expect(tall).toEqual(box(0, 0, 1, 10));
  });

  it('the east handle stops at the scene edge', () => {
    expect(resizeTokenBox(SCENE, box(18, 0, 1, 1), 'e', { x: 6, y: 0 })).toEqual(box(18, 0, 2, 1));
  });

  it('the west handle stops at column 0', () => {
    expect(resizeTokenBox(SCENE, box(1, 0, 1, 1), 'w', { x: -5, y: 0 })).toEqual(box(0, 0, 2, 1));
  });
});

describe('resizeTokenBox — corners keep the proportion', () => {
  it('the south-east corner grows a 2×1 to 4×2', () => {
    expect(resizeTokenBox(SCENE, box(1, 1, 2, 1), 'se', { x: 2, y: 1 })).toEqual(box(1, 1, 4, 2));
  });

  it('the north-west corner moves the origin and keeps the south-east corner fixed', () => {
    expect(resizeTokenBox(SCENE, box(4, 4, 2, 2), 'nw', { x: -1, y: -1 })).toEqual(box(3, 3, 3, 3));
  });

  it('a corner shrinking a 2×1 stops when the short side hits half a cell', () => {
    expect(resizeTokenBox(SCENE, box(0, 0, 2, 1), 'se', { x: -5, y: -5 })).toEqual(
      box(0, 0, 1, 0.5),
    );
  });

  it('a corner growing a 1×2 stops when the long side hits the scene', () => {
    expect(resizeTokenBox(SCENE, box(0, 8, 1, 2), 'se', { x: 9, y: 9 })).toEqual(box(0, 8, 2, 4));
  });
});

describe('resizeTokenBox — free step (the preview while dragging)', () => {
  it('with step 0 the east side follows the pointer exactly: 1.2 cells wider', () => {
    const box = resizeTokenBox(
      SCENE,
      { col: 3, row: 3, width: 1, height: 1 },
      'e',
      { x: 1.2, y: 0 },
      0,
    );
    expect(box.width).toBeCloseTo(2.2, 10);
  });

  it('with step 0 the west side moves the origin by the same amount and keeps the east side', () => {
    const box = resizeTokenBox(
      SCENE,
      { col: 3, row: 3, width: 2, height: 2 },
      'w',
      { x: -0.3, y: 0 },
      0,
    );
    expect(box.col).toBeCloseTo(2.7, 10);
    expect(box.col + box.width).toBeCloseTo(5, 10);
  });

  it('with step 0 the limits still hold: never under half a cell, never past the scene', () => {
    const tiny = resizeTokenBox(
      SCENE,
      { col: 3, row: 3, width: 1, height: 1 },
      'e',
      { x: -3, y: 0 },
      0,
    );
    const past = resizeTokenBox(
      SCENE,
      { col: 18.2, row: 0, width: 1, height: 1 },
      'e',
      { x: 9, y: 0 },
      0,
    );
    expect(tiny.width).toBe(0.5);
    expect(past.col + past.width).toBeCloseTo(20, 10);
  });
});
