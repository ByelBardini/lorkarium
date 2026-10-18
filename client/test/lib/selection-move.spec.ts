import { describe, expect, it } from 'vitest';
import { selectionMoveOf } from '@/lib/selection-move';
import { PATH_ID, path, SQUARE_ID, square } from '../support/drawing-fixtures';
import { ANA_CIRCLE_ID, BIA_CONE_ID, anaCircle, biaCone } from '../support/effect-area-fixtures';
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

describe('selectionMoveOf, areas of effect', () => {
  const board = vharnBoard({
    tokens: [lyra()],
    drawings: [square()],
    effectAreas: [biaCone(), anaCircle({ kind: 'smooth_circle', x: 10.25, y: 5.5 })],
  });

  it('a grid area dragged 1.4 × −0.6 goes by whole cells, (1, −1)', () => {
    const move = selectionMoveOf(board, {
      ...DROP,
      drawingIds: [],
      effectAreaIds: [BIA_CONE_ID],
      dx: 1.4,
      dy: -0.6,
    });
    expect(move?.effectAreas).toEqual([
      {
        effectAreaId: BIA_CONE_ID,
        from: { kind: 'diagonal_cone', x: 6, y: 6, reach: 3, facing: 45, color: 'ember' },
        to: { kind: 'diagonal_cone', x: 7, y: 5, reach: 3, facing: 45, color: 'ember' },
      },
    ]);
  });

  it('a smooth area goes by the exact drag, to the hundredth', () => {
    const move = selectionMoveOf(board, {
      ...DROP,
      drawingIds: [],
      effectAreaIds: [ANA_CIRCLE_ID],
      dx: 1.4,
      dy: -0.6,
    });
    expect(move?.effectAreas[0]?.to).toMatchObject({ x: 11.65, y: 4.9 });
  });

  it('a drawing drag carries the selected area along', () => {
    const move = selectionMoveOf(board, { ...DROP, effectAreaIds: [BIA_CONE_ID], dx: 2, dy: 1 });
    expect(move?.drawings).toHaveLength(1);
    expect(move?.effectAreas[0]?.to).toMatchObject({ x: 8, y: 7 });
  });

  it('an area whose origin would leave the scene stops the whole move', () => {
    expect(
      selectionMoveOf(board, { ...DROP, effectAreaIds: [BIA_CONE_ID], dx: -7, dy: 0 }),
    ).toBeNull();
    expect(
      selectionMoveOf(board, { ...DROP, effectAreaIds: [BIA_CONE_ID], dx: 15, dy: 0 }),
    ).toBeNull();
  });

  it('the selected tokens still go by whole cells with the areas', () => {
    const move = selectionMoveOf(board, {
      ...DROP,
      drawingIds: [],
      effectAreaIds: [BIA_CONE_ID],
      selectedTokenIds: [LYRA_ID],
      dx: 1.4,
      dy: 0,
    });
    expect(move?.tokens).toEqual([
      { tokenId: LYRA_ID, from: { col: 3, row: 4 }, to: { col: 4, row: 4 } },
    ]);
  });
});

describe('selectionMoveOf', () => {
  it('each dragged drawing goes from its corner to the corner moved by the drag', () => {
    expect(selectionMoveOf(BOARD, DROP)).toEqual({
      drawings: [{ drawingId: SQUARE_ID, from: { x: 2.5, y: 3 }, to: { x: 5, y: 4 } }],
      tokens: [],
      effectAreas: [],
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
      effectAreas: [],
    });
  });
});
