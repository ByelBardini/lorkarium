import { cell, footprintFits, type Cell, type SceneSize } from '@lorkarium/game-core';

/** One token of a group, where it stands now. */
export type GroupMember = Readonly<{ tokenId: string; col: number; row: number; size: number }>;

/** Where one token of a group lands. */
export type GroupPlacement = Readonly<{ tokenId: string; col: number; row: number }>;

/** The group moved as one: every member shifts by what the anchor did from `from` to `to`.
 *  `null` when any member would leave the scene, so a group never moves by half.
 *
 *  Example: `shiftGroup(scene, members, cell(2, 2), cell(4, 3)) // each +2, +1` */
export function shiftGroup(
  scene: SceneSize,
  members: readonly GroupMember[],
  from: Cell,
  to: Cell,
): GroupPlacement[] | null {
  const dCol = to.col - from.col;
  const dRow = to.row - from.row;
  const placed = members.map(({ tokenId, col, row, size }) => ({
    tokenId,
    col: col + dCol,
    row: row + dRow,
    size,
  }));
  const fits = placed.every(({ col, row, size }) => fitsAt(scene, col, row, size));
  return fits ? placed.map(({ tokenId, col, row }) => ({ tokenId, col, row })) : null;
}

// `cell()` refuses a negative index, so the edge is checked before it is built.
function fitsAt(scene: SceneSize, col: number, row: number, size: number): boolean {
  if (col < 0 || row < 0) return false;
  return footprintFits(scene, cell(col, row), size);
}
