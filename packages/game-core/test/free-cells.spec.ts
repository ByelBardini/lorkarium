import { describe, expect, it } from 'vitest';
import { cell } from '../src/cell.vo';
import { freeCellsAround } from '../src/free-cells';
import type { TokenBox } from '../src/token-resize';
import { tokenSize } from '../src/token-size.vo';

const SCENE_20_BY_12 = { widthCells: 20, heightCells: 12 };
const ONE = tokenSize(1, 1);
const TWO = tokenSize(2, 2);

function box(col: number, row: number, width = 1, height = 1): TokenBox {
  return { col, row, width, height };
}

describe('freeCellsAround', () => {
  it('three 1×1 around a free (5, 5) take the center, then right, then below', () => {
    const placed = freeCellsAround(cell(5, 5), [ONE, ONE, ONE], [], SCENE_20_BY_12);
    expect(placed).toEqual([cell(5, 5), cell(6, 5), cell(5, 6)]);
  });

  it('a 2×2 at the center pushes the two 1×1 to the left and above it', () => {
    const placed = freeCellsAround(cell(5, 5), [TWO, ONE, ONE], [], SCENE_20_BY_12);
    expect(placed).toEqual([cell(5, 5), cell(4, 5), cell(5, 4)]);
  });

  it('cells under tokens already on the scene are skipped', () => {
    const occupied = [box(5, 5), box(6, 5)];
    expect(freeCellsAround(cell(5, 5), [ONE], occupied, SCENE_20_BY_12)).toEqual([cell(5, 6)]);
  });

  it('a half-cell token still blocks the cell it stands on', () => {
    const occupied = [box(5.5, 5, 0.5, 0.5)];
    expect(freeCellsAround(cell(5, 5), [ONE], occupied, SCENE_20_BY_12)).toEqual([cell(6, 5)]);
  });

  it('a token only touching the edge of the center leaves it free', () => {
    const occupied = [box(4, 5), box(5, 4)];
    expect(freeCellsAround(cell(5, 5), [ONE], occupied, SCENE_20_BY_12)).toEqual([cell(5, 5)]);
  });

  it('the scene edge cuts the ring around a corner cell', () => {
    const placed = freeCellsAround(cell(19, 11), [ONE, ONE], [], SCENE_20_BY_12);
    expect(placed).toEqual([cell(19, 11), cell(18, 11)]);
  });

  it('a 2×2 at the corner goes to the first ring cell where it fits inside the scene', () => {
    expect(freeCellsAround(cell(19, 11), [TWO], [], SCENE_20_BY_12)).toEqual([cell(18, 10)]);
  });

  it('what was placed occupies for the next footprint, so a second 2×2 goes two cells right', () => {
    const placed = freeCellsAround(cell(5, 5), [TWO, TWO], [], SCENE_20_BY_12);
    expect(placed).toEqual([cell(5, 5), cell(7, 5)]);
  });

  it('a full scene gives null', () => {
    const scene = { widthCells: 2, heightCells: 2 };
    expect(freeCellsAround(cell(0, 0), [ONE], [box(0, 0, 2, 2)], scene)).toBeNull();
  });

  it('more footprints than free cells give null, not a partial list', () => {
    const scene = { widthCells: 2, heightCells: 1 };
    expect(freeCellsAround(cell(0, 0), [ONE, ONE, ONE], [], scene)).toBeNull();
  });

  it('no footprints give an empty list', () => {
    expect(freeCellsAround(cell(5, 5), [], [], SCENE_20_BY_12)).toEqual([]);
  });

  it('a center outside the scene is refused citing the cell and the scene', () => {
    const place = () => freeCellsAround(cell(20, 5), [ONE], [], SCENE_20_BY_12);
    expect(place).toThrow(RangeError);
    expect(place).toThrow('Center cell (20, 5) is outside the 20 × 12 scene');
  });
});
