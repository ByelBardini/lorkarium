import { cell } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import {
  dropCellOf,
  grabOffsetOf,
  heldCenterOf,
  movePress,
  pressToken,
  releasePress,
} from '@/renderer/token-drag';

const C = CELL_WORLD_SIZE;
const SCENE = { widthCells: 20, heightCells: 12 };
const ONE = { width: 1, height: 1 };
const TWO = { width: 2, height: 2 };

describe('dropCellOf', () => {
  it('a 1×1 token dropped inside cell (8, 6) lands on (8, 6)', () => {
    expect(dropCellOf(SCENE, ONE, { x: 8 * C + 10, y: 6 * C + 60 })).toEqual(cell(8, 6));
  });

  it('a 2×2 token is held by its center: dropped at the corner of (5, 5) it covers 4..5', () => {
    expect(dropCellOf(SCENE, TWO, { x: 5 * C, y: 5 * C })).toEqual(cell(4, 4));
  });

  it('a half-cell token snaps to the half cell under its center', () => {
    expect(dropCellOf(SCENE, { width: 0.5, height: 0.5 }, { x: 3.8 * C, y: 2.3 * C })).toEqual(
      cell(3.5, 2),
    );
  });

  it('a 1.5×1 token snaps to half a cell across and to a whole cell down', () => {
    expect(dropCellOf(SCENE, { width: 1.5, height: 1 }, { x: 5.3 * C, y: 5.3 * C })).toEqual(
      cell(4.5, 5),
    );
  });

  it('a 3×1 token dropped against the right edge does not leave the scene', () => {
    expect(dropCellOf(SCENE, { width: 3, height: 1 }, { x: 19 * C, y: C / 2 })).toBeNull();
    expect(dropCellOf(SCENE, { width: 3, height: 1 }, { x: 18.5 * C, y: C / 2 })).toEqual(
      cell(17, 0),
    );
  });

  it('a drop past the edge of the scene is no cell', () => {
    expect(dropCellOf(SCENE, ONE, { x: 20 * C + 5, y: 0 })).toBeNull();
    expect(dropCellOf(SCENE, TWO, { x: 19 * C + 40, y: C })).toBeNull();
  });

  it('a drop above or left of the scene is no cell', () => {
    expect(dropCellOf(SCENE, ONE, { x: -5, y: 10 })).toBeNull();
  });
});

describe('where the token is held', () => {
  const kael = { col: 2, row: 2, width: 1, height: 1 };

  it('a press near the top-left corner holds the token 24 px left and up of its center', () => {
    expect(grabOffsetOf(kael, { x: 2 * C + 8, y: 2 * C + 8 })).toEqual({ x: -24, y: -24 });
  });

  it('dragged, the token keeps that hold: its center stays 24 px right and down of the pointer', () => {
    const press = pressToken('kael', true, { x: 0, y: 0 }, { x: -24, y: -24 });
    expect(heldCenterOf(press, { x: 500, y: 300 })).toEqual({ x: 524, y: 324 });
  });

  it('a press without a hold (the keyboard, a test) keeps the old centered behaviour', () => {
    expect(heldCenterOf(pressToken('kael', true, { x: 0, y: 0 }), { x: 5, y: 6 })).toEqual({
      x: 5,
      y: 6,
    });
  });
});

describe('token press', () => {
  it('a press released without moving is a pick', () => {
    const press = pressToken('lyra', true, { x: 10, y: 10 });
    expect(releasePress(movePress(press, { x: 12, y: 11 }).press)).toBe('pick');
  });

  it('from 4 px on, a draggable token is being dragged and its release is a drop', () => {
    const moved = movePress(pressToken('lyra', true, { x: 10, y: 10 }), { x: 15, y: 10 });
    expect(moved.dragging).toBe(true);
    expect(releasePress(moved.press)).toBe('drop');
  });

  it('a token that is not draggable is never dragged: its release is a pick', () => {
    const moved = movePress(pressToken('goblin', false, { x: 10, y: 10 }), { x: 60, y: 10 });
    expect(moved.dragging).toBe(false);
    expect(releasePress(moved.press)).toBe('pick');
  });
});
