import { cell } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { shiftGroup } from '@/lib/token-group';

const SCENE = { widthCells: 20, heightCells: 12 };

describe('shiftGroup', () => {
  it('the anchor going from (2,2) to (4,3) shifts every member by +2,+1', () => {
    const members = [
      { tokenId: 'a', col: 2, row: 2, width: 1, height: 1 },
      { tokenId: 'b', col: 3, row: 2, width: 1, height: 1 },
      { tokenId: 'c', col: 5, row: 5, width: 2, height: 2 },
    ];
    expect(shiftGroup(SCENE, members, cell(2, 2), cell(4, 3))).toEqual([
      { tokenId: 'a', col: 4, row: 3 },
      { tokenId: 'b', col: 5, row: 3 },
      { tokenId: 'c', col: 7, row: 6 },
    ]);
  });

  it('a member pushed past the right edge makes the whole shift null', () => {
    const members = [
      { tokenId: 'a', col: 2, row: 2, width: 1, height: 1 },
      { tokenId: 'wide', col: 17, row: 2, width: 2, height: 2 },
    ];
    expect(shiftGroup(SCENE, members, cell(2, 2), cell(4, 2))).toBeNull();
  });

  it('a member pushed to a negative column makes the whole shift null', () => {
    const members = [
      { tokenId: 'a', col: 5, row: 2, width: 1, height: 1 },
      { tokenId: 'b', col: 0, row: 2, width: 1, height: 1 },
    ];
    expect(shiftGroup(SCENE, members, cell(5, 2), cell(4, 2))).toBeNull();
  });

  it('a group of one lands on the cell the anchor went to', () => {
    const members = [{ tokenId: 'a', col: 2, row: 2, width: 1, height: 1 }];
    expect(shiftGroup(SCENE, members, cell(2, 2), cell(9, 7))).toEqual([
      { tokenId: 'a', col: 9, row: 7 },
    ]);
  });

  it('a 3×1 member at column 16 fits a shift of +1 but not of +2', () => {
    const members = [{ tokenId: 'horse', col: 16, row: 2, width: 3, height: 1 }];
    expect(shiftGroup(SCENE, members, cell(16, 2), cell(17, 2))).toEqual([
      { tokenId: 'horse', col: 17, row: 2 },
    ]);
    expect(shiftGroup(SCENE, members, cell(16, 2), cell(18, 2))).toBeNull();
  });
});
