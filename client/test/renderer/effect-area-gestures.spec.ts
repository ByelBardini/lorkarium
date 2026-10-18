import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DRAWING_STYLE } from '@/lib/drawing-style';
import type { BoardIntent } from '@/renderer/board-renderer';
import { buildBoardView, type BoardView } from '@/renderer/board-view';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { EffectAreaGestures } from '@/renderer/effect-area-gestures';
import { EffectAreaCanvasFake } from '../support/effect-area-canvas-fake';
import { BIA_CONE_ID, biaCone } from '../support/effect-area-fixtures';
import { SQUARE_ID, square } from '../support/drawing-fixtures';
import { BIA_AT_TABLE, VHARN_SCENE, lyra } from '../support/table-session-fixtures';

const CELL = CELL_WORLD_SIZE;
// The sketch reads the world point; the screen point only counts for a press on an area.
const SCREEN = { x: 0, y: 0 };

function boardView(overrides: Partial<Parameters<typeof buildBoardView>[0]> = {}): BoardView {
  return buildBoardView({
    scene: VHARN_SCENE,
    localGridVisible: true,
    ruler: null,
    tokens: [lyra({ col: 5, row: 4 })],
    selectedTokenIds: [],
    activeLayer: 'tokens',
    canChooseLayer: false,
    preview: [],
    facingPreview: {},
    resizePreview: {},
    drag: null,
    dragged: {},
    readOnly: false,
    tool: 'area',
    currentTokenId: null,
    drawings: [],
    viewer: { userId: BIA_AT_TABLE.userId, isMaster: false },
    selectedDrawingIds: [],
    drawingPreview: [],
    drawingStyle: DEFAULT_DRAWING_STYLE,
    effectAreaStyle: { kind: 'circle', color: 'moss' },
    ...overrides,
  });
}

function at(x: number, y: number) {
  return { x: x * CELL, y: y * CELL };
}

describe('EffectAreaGestures', () => {
  let canvas: EffectAreaCanvasFake;
  let intents: BoardIntent[];
  let gestures: EffectAreaGestures;

  beforeEach(() => {
    canvas = new EffectAreaCanvasFake();
    intents = [];
    gestures = new EffectAreaGestures(canvas, (intent) => intents.push(intent));
  });

  it('the draft follows the pointer with its size, in the panel color', () => {
    gestures.startSketch(boardView(), at(5.2, 4.9));
    gestures.move(SCREEN, at(8.1, 5), false);

    expect(canvas.drafts.at(-1)).toMatchObject({
      area: { kind: 'circle', x: 5, y: 5, reach: 3 },
      color: 'moss',
      label: 'Raio 3 casas · 4,5 m',
    });
    expect(canvas.drafts.at(-1)?.cells.length).toBeGreaterThan(0);
  });

  it('the release reports the shape to create and clears the draft', () => {
    gestures.startSketch(boardView(), at(5.2, 4.9));
    gestures.move(SCREEN, at(7, 5), false);

    expect(gestures.release(SCREEN, at(8.1, 5), false)).toBe(true);

    expect(intents).toEqual([
      {
        kind: 'effectAreaSketched',
        shape: { kind: 'circle', x: 5, y: 5, reach: 3, color: 'moss' },
      },
    ]);
    expect(canvas.drafts.at(-1)).toBeNull();
  });

  it('an emanation is born around the token under the press', () => {
    const view = boardView({ effectAreaStyle: { kind: 'emanation', color: 'violet' } });
    gestures.startSketch(view, at(5.5, 4.5));

    gestures.release(SCREEN, at(8.3, 4.5), false);

    expect(intents).toEqual([
      {
        kind: 'effectAreaSketched',
        shape: { kind: 'emanation', x: 5, y: 4, width: 1, height: 1, reach: 2, color: 'violet' },
      },
    ]);
  });

  it('a release under half a cell from the press creates nothing', () => {
    gestures.startSketch(boardView(), at(5, 5));

    gestures.release(SCREEN, at(5.2, 5.1), false);

    expect(intents).toEqual([]);
  });

  it('Esc lets go of the draft without creating anything', () => {
    gestures.startSketch(boardView(), at(5, 5));
    gestures.move(SCREEN, at(8, 5), false);

    expect(gestures.cancel()).toBe(true);

    expect(gestures.release(SCREEN, at(8, 5), false)).toBe(false);
    expect(intents).toEqual([]);
    expect(canvas.drafts.at(-1)).toBeNull();
  });

  it('with another tool the view has no area sketch and a press starts nothing', () => {
    gestures.startSketch(boardView({ tool: 'select' }), at(5, 5));

    expect(gestures.move(SCREEN, at(8, 5), false)).toBe(false);
  });

  describe('with Selecionar', () => {
    const select = (overrides: Partial<Parameters<typeof buildBoardView>[0]> = {}) =>
      boardView({ tool: 'select', effectAreas: [biaCone()], ...overrides });
    const press = { screen: { x: 100, y: 100 }, world: at(7.5, 6.5) };

    it('a press on her cone without moving picks it, Shift adding it', () => {
      expect(gestures.press(select(), press.screen, press.world)).toBe(true);

      gestures.release(press.screen, press.world, true);

      expect(intents).toEqual([
        { kind: 'effectAreaPicked', effectAreaId: BIA_CONE_ID, additive: true },
      ]);
    });

    it('a press on no area is not taken', () => {
      expect(gestures.press(select(), press.screen, at(15, 2))).toBe(false);
    });

    it('dragging the cone past 4 px moves it on the canvas and drops it by the cells moved', () => {
      gestures.press(select(), press.screen, press.world);
      const to = { screen: { x: 164, y: 132 }, world: at(8.5, 7) };

      gestures.move(to.screen, to.world, false);
      gestures.release(to.screen, to.world, false);

      expect(canvas.dragged).toEqual({
        effectAreaIds: [BIA_CONE_ID],
        offset: { x: CELL, y: CELL / 2 },
      });
      expect(canvas.releases).toBe(1);
      expect(intents).toEqual([
        {
          kind: 'drawingsDropped',
          anchorId: BIA_CONE_ID,
          drawingIds: [],
          effectAreaIds: [BIA_CONE_ID],
          dx: 1,
          dy: 0.5,
        },
      ]);
    });

    it('a selected cone carries the selected drawings along', () => {
      const view = select({
        drawings: [square()],
        selectedDrawingIds: [SQUARE_ID],
        selectedEffectAreaIds: [BIA_CONE_ID],
      });
      gestures.press(view, press.screen, press.world);
      const to = { screen: { x: 164, y: 100 }, world: at(8.5, 6.5) };

      gestures.move(to.screen, to.world, false);
      gestures.release(to.screen, to.world, false);

      expect(intents[0]).toMatchObject({ drawingIds: [SQUARE_ID], effectAreaIds: [BIA_CONE_ID] });
    });

    it('Esc during a drag puts the cone back and drops nothing', () => {
      gestures.press(select(), press.screen, press.world);
      gestures.move({ x: 164, y: 132 }, at(8.5, 7), false);

      expect(gestures.cancel()).toBe(true);

      expect(canvas.releases).toBe(1);
      expect(intents).toEqual([]);
    });
  });
});
