import { describe, expect, it } from 'vitest';
import {
  cellsForImage,
  heightForWidth,
  isProportional,
  widthForHeight,
} from '@/lib/scene-proportion';

const MAP_2_TO_1 = { width: 1400, height: 700 };

describe('cellsForImage', () => {
  it('a 1400×700 image keeps the 20 cells of width and gets 10 of height', () => {
    expect(cellsForImage(MAP_2_TO_1, 20)).toEqual({ widthCells: 20, heightCells: 10 });
  });

  it('a 1000×333 image rounds 6.66 cells of height to 7', () => {
    expect(cellsForImage({ width: 1000, height: 333 }, 20)).toEqual({
      widthCells: 20,
      heightCells: 7,
    });
  });

  it('a tall 500×5000 image stops the height at 100 cells and the width follows to 10', () => {
    expect(cellsForImage({ width: 500, height: 5000 }, 20)).toEqual({
      widthCells: 10,
      heightCells: 100,
    });
  });

  it('a very wide image never goes under 1 cell of height', () => {
    expect(cellsForImage({ width: 10_000, height: 10 }, 20).heightCells).toBe(1);
  });
});

describe('heightForWidth and widthForHeight', () => {
  it('30 cells of width on a 2:1 image ask 15 of height', () => {
    expect(heightForWidth(MAP_2_TO_1, 30)).toBe(15);
  });

  it('15 cells of height on a 2:1 image ask 30 of width', () => {
    expect(widthForHeight(MAP_2_TO_1, 15)).toBe(30);
  });

  it('a width past the limit asks at most 100 of height', () => {
    expect(heightForWidth({ width: 100, height: 300 }, 50)).toBe(100);
  });
});

describe('isProportional', () => {
  it('30 × 15 on a 2:1 image follows it', () => {
    expect(isProportional({ widthCells: 30, heightCells: 15 }, MAP_2_TO_1)).toBe(true);
  });

  it('30 × 10 on a 2:1 image is stretched', () => {
    expect(isProportional({ widthCells: 30, heightCells: 10 }, MAP_2_TO_1)).toBe(false);
  });

  it('20 × 7 on a 1000×333 image follows it once rounded', () => {
    expect(isProportional({ widthCells: 20, heightCells: 7 }, { width: 1000, height: 333 })).toBe(
      true,
    );
  });
});
