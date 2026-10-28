import { describe, expect, it } from 'vitest';
import { formBoxIn } from '../src/token-form';

const SCENE_20 = { widthCells: 20, heightCells: 20 };
const SCENE_10 = { widthCells: 10, heightCells: 10 };

describe('formBoxIn', () => {
  it('a 1×1 token turning 2×2 keeps its top-left corner', () => {
    const box = formBoxIn(
      SCENE_20,
      { col: 3, row: 3, width: 1, height: 1 },
      { width: 2, height: 2 },
    );

    expect(box).toEqual({ col: 3, row: 3, width: 2, height: 2 });
  });

  it('a 2×2 token shrinking to half a cell keeps its top-left corner', () => {
    const box = formBoxIn(
      SCENE_20,
      { col: 3, row: 3, width: 2, height: 2 },
      { width: 0.5, height: 0.5 },
    );

    expect(box).toEqual({ col: 3, row: 3, width: 0.5, height: 0.5 });
  });

  it('a token on the right edge steps left just enough to fit', () => {
    const box = formBoxIn(
      SCENE_10,
      { col: 9, row: 4, width: 1, height: 1 },
      { width: 2, height: 2 },
    );

    expect(box).toEqual({ col: 8, row: 4, width: 2, height: 2 });
  });

  it('a token in the bottom-right corner steps back on both axes', () => {
    const box = formBoxIn(
      SCENE_10,
      { col: 9, row: 9, width: 1, height: 1 },
      { width: 3, height: 3 },
    );

    expect(box).toEqual({ col: 7, row: 7, width: 3, height: 3 });
  });

  it('a form larger than the scene is refused citing both sizes', () => {
    const scene = { widthCells: 2, heightCells: 2 };
    const box = { col: 0, row: 0, width: 1, height: 1 };

    expect(() => formBoxIn(scene, box, { width: 3, height: 3 })).toThrow(/3×3.*scene 2×2/);
  });

  it('a side off the half-cell steps is refused by tokenSize', () => {
    const box = { col: 0, row: 0, width: 1, height: 1 };

    expect(() => formBoxIn(SCENE_10, box, { width: 1.3, height: 1 })).toThrow(
      /width 1.3.*multiple of 0.5/,
    );
  });
});
