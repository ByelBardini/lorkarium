import { cell, footprintFits, tokenSize, type Cell, type SceneSize } from '@lorkarium/game-core';

/** One token of a group, where it stands now. */
export type GroupMember = Readonly<{
  tokenId: string;
  col: number;
  row: number;
  width: number;
  height: number;
}>;

/** A token as a member of a group.
 *
 *  Example: `selected.map(groupMemberOf)` */
export function groupMemberOf(
  token: Readonly<{
    id: string;
    col: number;
    row: number;
    width: number;
    height: number;
  }>,
): GroupMember {
  return {
    tokenId: token.id,
    col: token.col,
    row: token.row,
    width: token.width,
    height: token.height,
  };
}

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
  const placed = members.map((member) => ({
    ...member,
    col: member.col + dCol,
    row: member.row + dRow,
  }));
  const fits = placed.every((member) => fitsAt(scene, member));
  return fits ? placed.map(({ tokenId, col, row }) => ({ tokenId, col, row })) : null;
}

// `cell()` refuses a negative index, so the edge is checked before it is built.
function fitsAt(scene: SceneSize, member: GroupMember): boolean {
  if (member.col < 0 || member.row < 0) return false;
  const size = tokenSize(member.width, member.height);
  return footprintFits(scene, cell(member.col, member.row), size);
}
