import { describe, expect, it } from 'vitest';
import { placeCharacters } from '../../../src/modules/tokens/character-placement.bo';

const ONE = { width: 1, height: 1 };
const scene = (widthCells: number, heightCells: number) => ({ widthCells, heightCells });

describe('placeCharacters', () => {
  it('puts each character around the center, the nearest cells first, off the occupied ones', () => {
    const cells = placeCharacters({
      sceneId: 'estrada',
      scene: scene(20, 12),
      center: { col: 5, row: 5 },
      footprints: [ONE, ONE],
      occupied: [{ col: 5, row: 5, width: 1, height: 1 }],
    });

    expect(cells).toEqual([
      { col: 6, row: 5 },
      { col: 5, row: 6 },
    ]);
  });

  it('a grid with room for one of three is NO_FREE_CELLS citing the two left out', () => {
    const place = () =>
      placeCharacters({
        sceneId: 'cela',
        scene: scene(2, 1),
        center: { col: 0, row: 0 },
        footprints: [ONE, ONE, ONE],
        occupied: [{ col: 1, row: 0, width: 1, height: 1 }],
      });

    expect(place).toThrow(
      expect.objectContaining({
        code: 'NO_FREE_CELLS',
        message: expect.stringContaining('no free cells for 2 of the 3 characters'),
      }),
    );
  });

  it('a center outside the grid is OUT_OF_SCENE', () => {
    const place = () =>
      placeCharacters({
        sceneId: 'cela',
        scene: scene(2, 1),
        center: { col: 4, row: 0 },
        footprints: [ONE],
        occupied: [],
      });

    expect(place).toThrow(expect.objectContaining({ code: 'OUT_OF_SCENE' }));
  });
});
