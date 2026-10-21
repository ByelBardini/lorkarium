import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DRAWING_STYLE } from '@/lib/drawing-style';
import type { BoardIntent } from '@/renderer/board-renderer';
import { buildBoardView, type BoardView } from '@/renderer/board-view';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { DrawingGestures } from '@/renderer/drawing-gestures';
import { PATH_ID, path, SQUARE_ID, square } from '../support/drawing-fixtures';
import { DrawingCanvasFake } from '../support/drawing-canvas-fake';
import { BIA_AT_TABLE, VHARN_SCENE } from '../support/table-session-fixtures';

const CELL = CELL_WORLD_SIZE;

function boardView(overrides: Partial<Parameters<typeof buildBoardView>[0]> = {}): BoardView {
  return buildBoardView({
    scene: VHARN_SCENE,
    localGridVisible: true,
    ruler: null,
    tokens: [],
    selectedTokenIds: [],
    activeLayer: 'tokens',
    canChooseLayer: false,
    preview: [],
    facingPreview: {},
    resizePreview: {},
    drag: null,
    dragged: {},
    readOnly: false,
    tool: 'draw',
    drawMode: 'select',
    currentTokenIds: [],
    drawings: [square(), path()],
    viewer: { userId: BIA_AT_TABLE.userId, isMaster: false },
    selectedDrawingIds: [],
    drawingPreview: [],
    drawingStyle: DEFAULT_DRAWING_STYLE,
    ...overrides,
  });
}

// World px of a point given in cells: the gestures read both screen and world.
function at(x: number, y: number) {
  return { screen: { x: x * CELL, y: y * CELL }, world: { x: x * CELL, y: y * CELL } };
}

describe('DrawingGestures', () => {
  let canvas: DrawingCanvasFake;
  let intents: BoardIntent[];
  let gestures: DrawingGestures;

  beforeEach(() => {
    canvas = new DrawingCanvasFake();
    intents = [];
    gestures = new DrawingGestures(canvas, (intent) => intents.push(intent));
  });

  describe('draw tool in Selecionar', () => {
    it('a press and release on her square without moving picks it', () => {
      const view = boardView();
      const press = at(3, 3);

      expect(gestures.press(view, press.screen, press.world)).toBe(true);
      gestures.release(press.world, false);

      expect(intents).toEqual([{ kind: 'drawingPicked', drawingId: SQUARE_ID, additive: false }]);
    });

    it('a Shift click picks it additively', () => {
      const press = at(3, 3);
      gestures.press(boardView(), press.screen, press.world);

      gestures.release(press.world, true);

      expect(intents).toEqual([{ kind: 'drawingPicked', drawingId: SQUARE_ID, additive: true }]);
    });

    it('a press on a drawing she may not pick up is not taken', () => {
      const onPath = at(1.5, 1.5);

      expect(gestures.press(boardView(), onPath.screen, onPath.world)).toBe(false);
      expect(intents).toEqual([]);
    });

    it('dragging her square past 4 px moves it on the canvas and drops it by the cells moved', () => {
      const from = at(3, 3);
      const to = at(5.5, 4);
      gestures.press(boardView(), from.screen, from.world);

      gestures.move(to.screen, to.world, false);
      gestures.release(to.world, false);

      expect(canvas.offsets).toEqual([{ ids: [SQUARE_ID], x: 2.5 * CELL, y: CELL }]);
      expect(canvas.released).toBe(1);
      expect(intents).toEqual([
        {
          kind: 'drawingsDropped',
          anchorId: SQUARE_ID,
          drawingIds: [SQUARE_ID],
          effectAreaIds: [],
          dx: 2.5,
          dy: 1,
        },
      ]);
    });

    it('a selected drawing carries the other selected drawings she may pick up', () => {
      const asMaster = boardView({
        viewer: { userId: 'ana', isMaster: true },
        selectedDrawingIds: [SQUARE_ID, PATH_ID],
      });
      const from = at(3, 3);
      const to = at(4, 3);
      gestures.press(asMaster, from.screen, from.world);

      gestures.move(to.screen, to.world, false);
      gestures.release(to.world, false);

      expect(intents[0]).toMatchObject({ drawingIds: [SQUARE_ID, PATH_ID], dx: 1, dy: 0 });
    });

    it('Esc during a drag puts the drawing back and drops nothing', () => {
      const from = at(3, 3);
      const to = at(6, 6);
      gestures.press(boardView(), from.screen, from.world);
      gestures.move(to.screen, to.world, false);

      expect(gestures.cancel()).toBe(true);

      expect(canvas.released).toBe(1);
      expect(intents).toEqual([]);
    });
  });

  describe('draw tool in Desenhar', () => {
    const drawing = (): BoardView => boardView({ tool: 'draw', drawMode: 'draw' });

    it('a freehand sketch shows under the pointer and is reported with every point on release', () => {
      gestures.startSketch(drawing(), at(1, 1).world);
      gestures.move(at(2, 2).screen, at(2, 2).world, false);
      gestures.move(at(3, 1).screen, at(3, 1).world, false);

      gestures.release(at(3, 1).world, false);

      expect(canvas.sketches.at(-2)).toMatchObject({ kind: 'freehand', x: 1, y: 1, width: 2 });
      expect(canvas.sketches.at(-1)).toBeNull();
      expect(intents).toEqual([
        {
          kind: 'sketchFinished',
          points: [
            { x: 1, y: 1 },
            { x: 2, y: 2 },
            { x: 3, y: 1 },
          ],
          snap: false,
        },
      ]);
    });

    it('a sketch past the edge of the scene is held on the edge', () => {
      gestures.startSketch(drawing(), at(19, 11).world);

      gestures.move(at(25, 15).screen, at(25, 15).world, false);
      gestures.release(at(25, 15).world, true);

      expect(intents[0]).toMatchObject({
        points: [
          { x: 19, y: 11 },
          { x: 20, y: 12 },
        ],
        snap: true,
      });
    });

    it('Esc during a sketch clears it and reports nothing', () => {
      gestures.startSketch(drawing(), at(1, 1).world);
      gestures.move(at(2, 2).screen, at(2, 2).world, false);

      expect(gestures.cancel()).toBe(true);
      gestures.release(at(2, 2).world, false);

      expect(canvas.sketches.at(-1)).toBeNull();
      expect(intents).toEqual([]);
    });
  });

  it('with nothing pressed, a move, a release and Esc are not its business', () => {
    expect(gestures.move(at(1, 1).screen, at(1, 1).world, false)).toBe(false);
    expect(gestures.release(at(1, 1).world, false)).toBe(false);
    expect(gestures.cancel()).toBe(false);
  });
});
