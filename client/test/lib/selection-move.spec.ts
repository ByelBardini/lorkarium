import { describe, expect, it } from 'vitest';
import { selectionMoveOf } from '@/lib/selection-move';
import { PATH_ID, path, SQUARE_ID, square } from '../support/drawing-fixtures';
import { KAEL_ID, LYRA_ID, kael, lyra, vharnBoard } from '../support/table-session-fixtures';

const BOARD = vharnBoard({
  tokens: [lyra(), kael({ canControl: false })],
  drawings: [square(), path()],
});
const DROP = {
  drawingIds: [SQUARE_ID],
  dx: 2.5,
  dy: 1,
  selectedTokenIds: [],
  activeLayer: 'tokens',
} as const;

describe('selectionMoveOf', () => {
  it('each dragged drawing goes from its corner to the corner moved by the drag', () => {
    expect(selectionMoveOf(BOARD, DROP)).toEqual({
      drawings: [{ drawingId: SQUARE_ID, from: { x: 2.5, y: 3 }, to: { x: 5, y: 4 } }],
      tokens: [],
    });
  });

  it('a selected token the viewer controls goes along by the whole cells of the drag', () => {
    const move = selectionMoveOf(BOARD, { ...DROP, selectedTokenIds: [LYRA_ID] });

    expect(move?.tokens).toEqual([
      { tokenId: LYRA_ID, from: { col: 3, row: 4 }, to: { col: 6, row: 5 } },
    ]);
  });

  it('a selected token the viewer does not control stays', () => {
    const move = selectionMoveOf(BOARD, { ...DROP, selectedTokenIds: [KAEL_ID] });

    expect(move?.tokens).toEqual([]);
  });

  it('a drag under half a cell moves the drawings and leaves the tokens where they are', () => {
    const move = selectionMoveOf(BOARD, { ...DROP, dx: 0.3, dy: 0, selectedTokenIds: [LYRA_ID] });

    expect(move?.drawings[0]?.to).toEqual({ x: 2.8, y: 3 });
    expect(move?.tokens).toEqual([]);
  });

  it('a drop that would put a drawing past the edge of the scene moves nothing', () => {
    expect(selectionMoveOf(BOARD, { ...DROP, dx: 16 })).toBeNull();
  });

  it('a drop that would put a selected token past the edge moves nothing', () => {
    const lyraAtEdge = vharnBoard({ tokens: [lyra({ col: 19 })], drawings: [path()] });

    expect(
      selectionMoveOf(lyraAtEdge, {
        ...DROP,
        drawingIds: [PATH_ID],
        dx: 1,
        selectedTokenIds: [LYRA_ID],
      }),
    ).toBeNull();
  });

  it('a drawing id no longer on the board is left out', () => {
    expect(selectionMoveOf(BOARD, { ...DROP, drawingIds: ['gone'] })).toEqual({
      drawings: [],
      tokens: [],
    });
  });
});
