import { cell } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { dropCellOf, movePress, pressToken, releasePress } from '@/renderer/token-drag';

const C = CELL_WORLD_SIZE;
const SCENE = { widthCells: 20, heightCells: 12 };

describe('dropCellOf', () => {
  it('a size 1 token dropped inside cell (8, 6) lands on (8, 6)', () => {
    expect(dropCellOf(SCENE, 1, { x: 8 * C + 10, y: 6 * C + 60 })).toEqual(cell(8, 6));
  });

  it('a size 2 token is held by its center: dropped at the corner of (5, 5) it covers 4..5', () => {
    expect(dropCellOf(SCENE, 2, { x: 5 * C, y: 5 * C })).toEqual(cell(4, 4));
  });

  it('a drop past the edge of the scene is no cell', () => {
    expect(dropCellOf(SCENE, 1, { x: 20 * C + 5, y: 0 })).toBeNull();
    expect(dropCellOf(SCENE, 2, { x: 19 * C + 40, y: C })).toBeNull();
  });

  it('a drop above or left of the scene is no cell', () => {
    expect(dropCellOf(SCENE, 1, { x: -5, y: 10 })).toBeNull();
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
