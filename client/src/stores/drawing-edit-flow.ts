import type { DrawingDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import type { DrawingMove, EditOp, EffectAreaReshape, TokenMove } from '@/lib/edit-history';
import { shapeOfDrawing } from '@/lib/paste-placement';
import type { BoardCommandResult } from '@/services/table-board-commands';
import type { BoardInteractionDeps, BoardInteractionStore } from './board-interaction-store';
import { dropPreviewOf, effectAreaPreviewOf, sendReshapes } from './effect-area-edit-flow';

type StoreAccess = Pick<StoreApi<BoardInteractionStore>, 'getState' | 'setState'>;

/** A drag that ended: the drawings it carried and the selected tokens that went along. */
export type SelectionMove = Readonly<{
  drawings: readonly DrawingMove[];
  tokens: readonly TokenMove[];
  /** The areas of effect that went along (absent: none). */
  effectAreas?: readonly EffectAreaReshape[];
}>;

/** Moves the dragged drawings and areas (and the tokens selected with them): the previews show at once,
 *  each kind goes in one command, and what was confirmed is one entry on the undo stack. A
 *  refusal puts things back and says why.
 *
 *  Example: `await moveSelection(deps, store, { drawings, tokens })` */
export async function moveSelection(
  deps: BoardInteractionDeps,
  store: StoreAccess,
  move: SelectionMove,
): Promise<void> {
  const { getState, setState } = store;
  if (getState().readOnly) return;
  const drawingPreview = move.drawings.map(({ drawingId, to }) => ({ drawingId, ...to }));
  const preview = move.tokens.map(({ tokenId, to }) => ({ tokenId, col: to.col, row: to.row }));
  const reshapes = move.effectAreas ?? [];
  const effectAreaPreview = { ...getState().effectAreaPreview, ...effectAreaPreviewOf(reshapes) };
  setState({ drawingPreview, preview, effectAreaPreview });
  const drawings = move.drawings.length > 0 ? await sendDrawings(deps, move) : null;
  const areas = await sendReshapes(deps, reshapes);
  const tokens = move.tokens.length > 0 ? await sendTokens(deps, move) : null;
  if (getState().drawingPreview === drawingPreview) setState({ drawingPreview: [] });
  if (getState().preview === preview) setState({ preview: [] });
  dropPreviewOf(store, reshapes);
  const ops: EditOp[] = [];
  if (drawings?.ok) ops.push({ kind: 'drawingsMoved', moves: move.drawings });
  if (areas?.ok) ops.push({ kind: 'effectAreasReshaped', reshapes });
  if (tokens?.ok) ops.push({ kind: 'tokensMoved', moves: move.tokens });
  if (ops.length > 0) deps.recordEdit?.(ops);
  sayRefusal(deps, store, [drawings, areas, tokens]);
}

/** Deletes the drawings (Delete / Backspace on the selection) in one command; confirmed, they
 *  leave the selection and go on the undo stack with their shapes, to be drawn again.
 *
 *  Example: `await deleteDrawingsOf(deps, store, selectedDrawings)` */
export async function deleteDrawingsOf(
  deps: BoardInteractionDeps,
  store: StoreAccess,
  drawings: readonly DrawingDto[],
): Promise<void> {
  const { getState, setState } = store;
  if (getState().readOnly || drawings.length === 0) return;
  const ids = drawings.map(({ id }) => id);
  const result = await deps.commands.deleteDrawings(deps.campaignId, ids);
  if (!result.ok) return sayRefusal(deps, store, [result]);
  const kept = getState().selectedDrawingIds.filter((id) => !ids.includes(id));
  setState({ selectedDrawingIds: kept });
  const removed = drawings.map((drawing) => ({ id: drawing.id, shape: shapeOfDrawing(drawing) }));
  deps.recordEdit?.([{ kind: 'drawingsRemoved', drawings: removed }]);
}

function sendDrawings(
  deps: BoardInteractionDeps,
  move: SelectionMove,
): Promise<BoardCommandResult> {
  const moves = move.drawings.map(({ drawingId, to }) => ({ drawingId, x: to.x, y: to.y }));
  return deps.commands.moveDrawings(deps.campaignId, moves);
}

function sendTokens(deps: BoardInteractionDeps, move: SelectionMove): Promise<BoardCommandResult> {
  const moves = move.tokens.map(({ tokenId, to }) => ({ tokenId, col: to.col, row: to.row }));
  return deps.commands.moveTokens(deps.campaignId, moves);
}

function sayRefusal(
  deps: BoardInteractionDeps,
  { setState }: StoreAccess,
  results: readonly (BoardCommandResult | null)[],
): void {
  const refused = results.find((result) => result && !result.ok);
  if (refused && !refused.ok) setState({ notice: deps.describeRefusal(refused.failure) });
}
