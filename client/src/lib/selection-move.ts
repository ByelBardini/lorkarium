import type { BoardStateDto, TokenLayerDto } from '@lorkarium/contracts';
import { boxFits, cell } from '@lorkarium/game-core';
import { toHundredth } from './drawing-geometry';
import type { DrawingMove, TokenMove } from './edit-history';
import { groupMemberOf, shiftGroup } from './token-group';

/** The drawings dropped after a drag, by how many cells, and what else was selected. */
export type DrawingDrop = Readonly<{
  drawingIds: readonly string[];
  dx: number;
  dy: number;
  selectedTokenIds: readonly string[];
  activeLayer: TokenLayerDto;
}>;

export type SelectionMoveOf = Readonly<{
  drawings: readonly DrawingMove[];
  tokens: readonly TokenMove[];
}>;

/** What a drawing drag moves: each dragged drawing by the drag, and the selected tokens the
 *  viewer moves on the active layer by its whole cells. `null` when any of them would leave the
 *  scene, so nothing moves by half.
 *
 *  Example: `const move = selectionMoveOf(board, { drawingIds, dx, dy, selectedTokenIds, activeLayer })` */
export function selectionMoveOf(board: BoardStateDto, drop: DrawingDrop): SelectionMoveOf | null {
  const scene = { widthCells: board.scene.widthCells, heightCells: board.scene.heightCells };
  const drawings = drawingMovesOf(board, drop);
  const outside = drawings.some(({ drawingId, to }) => {
    const drawing = board.drawings.find(({ id }) => id === drawingId);
    return drawing && !boxFits(scene, { ...to, width: drawing.width, height: drawing.height });
  });
  if (outside) return null;
  const tokens = tokenMovesOf(board, drop);
  return tokens && { drawings, tokens };
}

function drawingMovesOf(board: BoardStateDto, drop: DrawingDrop): DrawingMove[] {
  return drop.drawingIds.flatMap((drawingId) => {
    const drawing = board.drawings.find(({ id }) => id === drawingId);
    if (!drawing) return [];
    const from = { x: drawing.x, y: drawing.y };
    const to = { x: toHundredth(drawing.x + drop.dx), y: toHundredth(drawing.y + drop.dy) };
    return [{ drawingId, from, to }];
  });
}

// The tokens go by whole cells; under half a cell they stay. `null`: one would leave the scene.
function tokenMovesOf(board: BoardStateDto, drop: DrawingDrop): TokenMove[] | null {
  const dCol = Math.round(drop.dx);
  const dRow = Math.round(drop.dy);
  if (dCol === 0 && dRow === 0) return [];
  const movable = board.tokens.filter(
    (token) =>
      drop.selectedTokenIds.includes(token.id) &&
      token.canControl &&
      token.layer === drop.activeLayer,
  );
  const [anchor] = movable;
  if (!anchor) return [];
  const members = movable.map(groupMemberOf);
  const from = cell(anchor.col, anchor.row);
  const landing = shiftGroup(board.scene, members, from, {
    col: anchor.col + dCol,
    row: anchor.row + dRow,
  });
  if (!landing) return null;
  return members.flatMap(({ tokenId, col, row }) => {
    const to = landing.find((placed) => placed.tokenId === tokenId);
    return to ? [{ tokenId, from: { col, row }, to: { col: to.col, row: to.row } }] : [];
  });
}
