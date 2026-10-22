import { describe, expect, it } from 'vitest';
import { drawingViewsOf, type DrawingViewInput } from '@/renderer/drawing-view';
import { PATH_ID, path, SQUARE_ID, square } from '../support/drawing-fixtures';
import { BIA_AT_TABLE, CAIO_AT_TABLE } from '../support/table-session-fixtures';

const AS_BIA: DrawingViewInput = {
  drawings: [square(), path()],
  viewer: { userId: BIA_AT_TABLE.userId, isMaster: false },
  picking: true,
  selectedDrawingIds: [],
  drawingPreview: [],
  readOnly: false,
};

function viewOf(id: string, input: DrawingViewInput = AS_BIA) {
  return drawingViewsOf(input).find((view) => view.id === id);
}

describe('drawingViewsOf', () => {
  it('Bia may pick up her own square, not the path of Caio', () => {
    expect(viewOf(SQUARE_ID)?.pickable).toBe(true);
    expect(viewOf(PATH_ID)?.pickable).toBe(false);
  });

  it('the master may pick up any drawing', () => {
    const asMaster = { ...AS_BIA, viewer: { userId: 'ana', isMaster: true } };

    expect(drawingViewsOf(asMaster).map(({ pickable }) => pickable)).toEqual([true, true]);
  });

  it('out of the draw tool in Selecionar no drawing is picked up, not even by its author or the master', () => {
    const notPicking = { ...AS_BIA, picking: false };
    const masterNotPicking = { ...notPicking, viewer: { userId: 'ana', isMaster: true } };

    expect(viewOf(SQUARE_ID, notPicking)?.pickable).toBe(false);
    expect(drawingViewsOf(masterNotPicking).map(({ pickable }) => pickable)).toEqual([
      false,
      false,
    ]);
  });

  it('nothing is picked up while reconnecting', () => {
    expect(viewOf(SQUARE_ID, { ...AS_BIA, readOnly: true })?.pickable).toBe(false);
  });

  it('a drawing with no author left is picked up only by the master', () => {
    const orphan = { ...AS_BIA, drawings: [square({ authorId: null })] };

    expect(viewOf(SQUARE_ID, orphan)?.pickable).toBe(false);
  });

  it('drawings come in drawing order, the order of the list', () => {
    const drawings = [square({ id: 'a' }), square({ id: 'b' }), square({ id: 'c' })];

    expect(drawingViewsOf({ ...AS_BIA, drawings }).map(({ id }) => id)).toEqual(['a', 'b', 'c']);
  });

  it('a selected drawing is marked, and a move waiting for the server shows it where it goes', () => {
    const input = {
      ...AS_BIA,
      selectedDrawingIds: [SQUARE_ID],
      drawingPreview: [{ drawingId: SQUARE_ID, x: 9, y: 1.5 }],
    };

    expect(viewOf(SQUARE_ID, input)).toMatchObject({
      selected: true,
      geometry: { kind: 'rectangle', x: 9, y: 1.5, width: 2, height: 2, fill: 'ember' },
    });
    expect(viewOf(PATH_ID, input)?.selected).toBe(false);
  });

  it('the view keeps the stroke and its width', () => {
    expect(viewOf(PATH_ID)).toMatchObject({
      stroke: 'moss',
      strokeWidth: 'thin',
      geometry: {
        kind: 'freehand',
        points: [
          [0, 0],
          [1, 1],
          [2, 0.5],
        ],
      },
    });
  });

  it('the view points at the confirmed drawing it came from, so the canvas redraws only on change', () => {
    const square_ = square();

    expect(viewOf(SQUARE_ID, { ...AS_BIA, drawings: [square_] })?.source).toBe(square_);
  });

  it('Caio may pick up his own path', () => {
    const asCaio = { ...AS_BIA, viewer: { userId: CAIO_AT_TABLE.userId, isMaster: false } };

    expect(viewOf(PATH_ID, asCaio)?.pickable).toBe(true);
  });
});
