import type { BoardStateDto, TokenLayerDto } from '@lorkarium/contracts';
import { boxFits, cell, effectAreaOriginFits, shiftEffectArea } from '@lorkarium/game-core';
import { toHundredth } from './drawing-geometry';
import type { DrawingMove, EffectAreaReshape, TokenMove } from './edit-history';
import { sentShapeOf, shapeOfEffectArea } from './effect-area-shape';
import { groupMemberOf, shiftGroup } from './token-group';

/** The drawings dropped after a drag, by how many cells, and what else was selected. */
export type DrawingDrop = Readonly<{
  drawingIds: readonly string[];
  /** The areas of effect dragged with them (none: no area goes). */
  effectAreaIds?: readonly string[];
  dx: number;
  dy: number;
  selectedTokenIds: readonly string[];
  activeLayer: TokenLayerDto;
}>;

export type SelectionMoveOf = Readonly<{
  drawings: readonly DrawingMove[];
  tokens: readonly TokenMove[];
  effectAreas: readonly EffectAreaReshape[];
}>;

/** What a selection drag moves: each dragged drawing by the drag, each dragged area of effect by
 *  its own rule (grid shapes by whole cells, smooth ones to the hundredth), and the selected
 *  tokens the viewer moves on the active layer by its whole cells. `null` when any of them would
 *  leave the scene, so nothing moves by half.
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
  const effectAreas = effectAreaMovesOf(board, drop);
  const tokens = tokenMovesOf(board, drop);
  return tokens && effectAreas && { drawings, tokens, effectAreas };
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

// Each area keeps where its shape is born; one whose origin would leave the scene stops them all.
function effectAreaMovesOf(board: BoardStateDto, drop: DrawingDrop): EffectAreaReshape[] | null {
  const scene = { widthCells: board.scene.widthCells, heightCells: board.scene.heightCells };
  const moves: EffectAreaReshape[] = [];
  for (const effectAreaId of drop.effectAreaIds ?? []) {
    const area = board.effectAreas.find(({ id }) => id === effectAreaId);
    if (!area) continue;
    const from = shapeOfEffectArea(area);
    const moved = shiftedOrNull(from, drop.dx, drop.dy);
    if (!moved || !effectAreaOriginFits(scene, moved)) return null;
    moves.push({ effectAreaId, from, to: sentShapeOf(moved, area.color) });
  }
  return moves;
}

// Before the scene's top-left the game-core refuses the shape: the move is out of the scene.
function shiftedOrNull(
  from: ReturnType<typeof shapeOfEffectArea>,
  dx: number,
  dy: number,
): ReturnType<typeof shiftEffectArea> | null {
  try {
    return shiftEffectArea(from, dx, dy);
  } catch {
    return null;
  }
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
