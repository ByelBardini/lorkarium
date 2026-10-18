import { cell } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { copiedOf, pastePlacement, type CopiedSelection } from '@/lib/paste-placement';
import { path, square } from '../support/drawing-fixtures';
import { activeCondition, kael, lyra } from '../support/table-session-fixtures';

const SCENE = { widthCells: 20, heightCells: 12 };

describe('copiedOf', () => {
  it('a copied token keeps its image, frame, flips and facing', () => {
    const look = {
      imageAssetId: '4a3b2c1d-0e9f-4a8b-9c7d-6e5f4a3b2c1d',
      frame: 'round',
      flipX: true,
      flipY: true,
      facing: 135,
    } as const;

    expect(copiedOf([lyra(look)], []).tokens[0]).toMatchObject(look);
  });

  it('a copied token keeps name, side, width, height, bars, controllers and layer, and no conditions', () => {
    const copied = copiedOf([lyra({ conditions: [activeCondition()], layer: 'objects' })], []);

    expect(copied.tokens).toEqual([
      {
        name: 'Lyra',
        initials: 'LY',
        side: 'ally',
        width: 1,
        height: 1,
        col: 3,
        row: 4,
        layer: 'objects',
        controllerIds: lyra().controllerIds,
        imageAssetId: null,
        frame: 'square',
        flipX: false,
        flipY: false,
        facing: 0,
        bars: [
          { label: 'PV', current: 32, max: 45, color: 'ember', visibility: 'controllers' },
          { label: 'Inspiração', current: 1, max: 1, color: 'gold', visibility: 'everyone' },
        ],
      },
    ]);
  });

  it('a copied drawing keeps its shape and style, without its id or author', () => {
    const copied = copiedOf([], [square()]);

    expect(copied.drawings).toEqual([
      {
        kind: 'rectangle',
        x: 2.5,
        y: 3,
        width: 2,
        height: 2,
        fill: 'ember',
        stroke: 'gold',
        strokeWidth: 'medium',
        layer: 'tokens',
      },
    ]);
  });
});

describe('pastePlacement', () => {
  const group: CopiedSelection = copiedOf(
    [lyra({ width: 2, height: 2, col: 4, row: 4 }), kael()],
    [],
  );

  it('the center of the group lands on the cell under the cursor, and the tokens keep their distance', () => {
    const placed = pastePlacement(group, cell(10, 6), SCENE);

    expect(placed?.tokens.map(({ col, row }) => [col, row])).toEqual([
      [9, 5],
      [10, 5],
    ]);
  });

  it('drawings move by the same cells as the tokens', () => {
    const mixed = copiedOf([lyra({ col: 4, row: 4 })], [path()]);

    const placed = pastePlacement(mixed, cell(10, 6), SCENE);

    expect(placed?.tokens[0]).toMatchObject({ col: 11, row: 7 });
    expect(placed?.drawings[0]).toMatchObject({ x: 8, y: 4 });
  });

  it('with the cursor off the board the copy lands one cell right and down of the original', () => {
    const placed = pastePlacement(group, null, SCENE);

    expect(placed?.tokens.map(({ col, row }) => [col, row])).toEqual([
      [5, 5],
      [6, 5],
    ]);
  });

  it('a paste that would leave the scene is pushed back inside by the edge', () => {
    const wide = copiedOf([lyra({ col: 8, row: 4 })], [square()]);

    const placed = pastePlacement(wide, cell(19, 11), SCENE);

    expect(placed?.tokens[0]).toMatchObject({ col: 19, row: 11 });
    expect(placed?.drawings[0]).toMatchObject({ x: 13.5, y: 10 });
  });

  it('a group bigger than the scene cannot be pasted', () => {
    const wide = copiedOf([], [square({ x: 0, width: 20 }), square({ x: 3, width: 2 })]);

    expect(pastePlacement(wide, cell(1, 1), { widthCells: 10, heightCells: 10 })).toBeNull();
  });
});
