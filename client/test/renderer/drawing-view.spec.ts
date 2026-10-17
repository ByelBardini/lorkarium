import { describe, expect, it } from 'vitest';
import { drawingViewsOf, type DrawingViewInput } from '@/renderer/drawing-view';
import { PATH_ID, path, SQUARE_ID, square } from '../support/drawing-fixtures';
import { BIA_AT_TABLE, CAIO_AT_TABLE } from '../support/table-session-fixtures';

const AS_BIA: DrawingViewInput = {
  drawings: [square(), path()],
  viewer: { userId: BIA_AT_TABLE.userId, isMaster: false },
  activeLayer: 'tokens',
  selectedDrawingIds: [],
  drawingPreview: [],
  readOnly: false,
};

function viewOf(id: string, input: DrawingViewInput = AS_BIA) {
  return drawingViewsOf(input).find((view) => view.id === id);
}

describe('drawingViewsOf', () => {
  it('Bia may pick up her own square on the tokens layer, not the path of Caio', () => {
    expect(viewOf(SQUARE_ID)?.pickable).toBe(true);
    expect(viewOf(PATH_ID)?.pickable).toBe(false);
  });

  it('the master may pick up any drawing on the active layer', () => {
    const asMaster = { ...AS_BIA, viewer: { userId: 'ana', isMaster: true } };

    expect(drawingViewsOf(asMaster).map(({ pickable }) => pickable)).toEqual([true, true]);
  });

  it('a drawing off the active layer is drawn but never picked up, even by its author', () => {
    const onObjects = { ...AS_BIA, drawings: [square({ layer: 'objects' })] };

    expect(viewOf(SQUARE_ID, onObjects)?.pickable).toBe(false);
  });

  it('nothing is picked up while reconnecting', () => {
    expect(viewOf(SQUARE_ID, { ...AS_BIA, readOnly: true })?.pickable).toBe(false);
  });

  it('a drawing with no author left is picked up only by the master', () => {
    const orphan = { ...AS_BIA, drawings: [square({ authorId: null })] };

    expect(viewOf(SQUARE_ID, orphan)?.pickable).toBe(false);
  });

  it('drawings come in drawing order: background, then objects, then tokens, list order inside', () => {
    const drawings = [
      square({ id: 'a', layer: 'tokens' }),
      square({ id: 'b', layer: 'background' }),
      square({ id: 'c', layer: 'objects' }),
      square({ id: 'd', layer: 'background' }),
    ];

    expect(drawingViewsOf({ ...AS_BIA, drawings }).map(({ id }) => id)).toEqual([
      'b',
      'd',
      'c',
      'a',
    ]);
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

  it('the view keeps the stroke, its width and the layer of the drawing', () => {
    expect(viewOf(PATH_ID)).toMatchObject({
      stroke: 'moss',
      strokeWidth: 'thin',
      layer: 'tokens',
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
