import { describe, expect, it } from 'vitest';
import { DEFAULT_DRAWING_STYLE } from '@/lib/drawing-style';
import { buildBoardView, type BoardView } from '@/renderer/board-view';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import {
  effectAreaFacingTarget,
  effectAreaResizeTarget,
  handleAreaOf,
} from '@/renderer/effect-area-handles';
import type { EffectAreaView } from '@/renderer/effect-area-view';
import { boardFacingTargetOf, boardResizeTargetOf } from '@/renderer/handle-targets';
import { SQUARE_ID, square } from '../support/drawing-fixtures';
import { ANA_CIRCLE_ID, BIA_CONE_ID, anaCircle, biaCone } from '../support/effect-area-fixtures';
import { ANA_AT_TABLE, LYRA_ID, VHARN_SCENE, lyra } from '../support/table-session-fixtures';

const C = CELL_WORLD_SIZE;
const SCENE = { widthCells: 20, heightCells: 12 };

function boardView(overrides: Partial<Parameters<typeof buildBoardView>[0]> = {}): BoardView {
  return buildBoardView({
    scene: VHARN_SCENE,
    localGridVisible: true,
    ruler: null,
    tokens: [lyra()],
    selectedTokenIds: [],
    activeLayer: 'tokens',
    canChooseLayer: true,
    preview: [],
    facingPreview: {},
    resizePreview: {},
    drag: null,
    dragged: {},
    readOnly: false,
    tool: 'select',
    currentTokenId: null,
    drawings: [square()],
    viewer: { userId: ANA_AT_TABLE.userId, isMaster: true },
    selectedDrawingIds: [],
    drawingPreview: [],
    drawingStyle: DEFAULT_DRAWING_STYLE,
    effectAreas: [biaCone(), anaCircle({ x: 5, y: 5 })],
    selectedEffectAreaIds: [ANA_CIRCLE_ID],
    ...overrides,
  });
}

function areaOf(view: BoardView, id: string): EffectAreaView {
  const area = view.effectAreas.find((candidate) => candidate.id === id);
  if (!area) throw new Error(`no area ${id} in the view`);
  return area;
}

describe('handleAreaOf', () => {
  it('the one selected area with nothing else selected shows the handles', () => {
    expect(handleAreaOf(boardView())?.id).toBe(ANA_CIRCLE_ID);
  });

  it.each([
    ['a token selected with it', { selectedTokenIds: [LYRA_ID] }],
    ['a drawing selected with it', { selectedDrawingIds: [SQUARE_ID] }],
    ['two areas selected', { selectedEffectAreaIds: [ANA_CIRCLE_ID, BIA_CONE_ID] }],
    ['the ruler', { tool: 'ruler' as const }],
    ['an area the viewer may not take', { viewer: { userId: 'someone', isMaster: false } }],
  ])('with %s there are no area handles', (_case, overrides) => {
    expect(handleAreaOf(boardView(overrides))).toBeNull();
  });

  it('the board targets fall to the area when no token is selected', () => {
    const view = boardView({ selectedEffectAreaIds: [BIA_CONE_ID] });
    expect(boardResizeTargetOf(view)?.id).toBe(BIA_CONE_ID);
    expect(boardFacingTargetOf(view)?.id).toBe(BIA_CONE_ID);
  });
});

describe('effectAreaResizeTarget', () => {
  it('the squares of a circle of reach 2 on (5, 5) sit on its box, from (3, 3) to (7, 7)', () => {
    const target = effectAreaResizeTarget(areaOf(boardView(), ANA_CIRCLE_ID), SCENE);
    expect(target.rect).toEqual({ x: 3 * C, y: 3 * C, width: 4 * C, height: 4 * C });
  });

  it('a square stretched east 1.4 cells grows to 4 × 2 in whole cells', () => {
    const view = boardView({
      effectAreas: [anaCircle({ kind: 'square', x: 2, y: 3, width: 3, height: 2 })],
    });
    const target = effectAreaResizeTarget(areaOf(view, ANA_CIRCLE_ID), SCENE);
    const intent = target.resized('e', { x: 5 * C, y: 4 * C }, { x: 6.4 * C, y: 4 * C }, false);
    expect(intent).toEqual({
      kind: 'effectAreaReshaped',
      effectAreaId: ANA_CIRCLE_ID,
      shape: { kind: 'square', x: 2, y: 3, width: 4, height: 2, color: 'moss' },
    });
  });

  it('any handle of a circle changes its reach toward the pointer, in whole cells, origin still', () => {
    const target = effectAreaResizeTarget(areaOf(boardView(), ANA_CIRCLE_ID), SCENE);
    const preview = target.previewed('ne', { x: 7 * C, y: 3 * C }, { x: 8.2 * C, y: 5 * C }, false);
    expect(preview).toEqual({
      kind: 'effectAreaReshapePreviewed',
      effectAreaId: ANA_CIRCLE_ID,
      shape: { kind: 'circle', x: 5, y: 5, reach: 3, color: 'moss' },
    });
  });

  it('a smooth circle follows the pointer to the hundredth, and Shift snaps it to half a cell', () => {
    const view = boardView({
      effectAreas: [anaCircle({ kind: 'smooth_circle', x: 5, y: 5, reach: 2 })],
    });
    const target = effectAreaResizeTarget(areaOf(view, ANA_CIRCLE_ID), SCENE);
    const now = { x: 7.37 * C, y: 5 * C };
    expect(target.previewed('e', now, now, false)).toMatchObject({ shape: { reach: 2.37 } });
    expect(target.resized('e', now, now, true)).toMatchObject({ shape: { reach: 2.5 } });
  });

  it('Esc lets go of the preview', () => {
    const target = effectAreaResizeTarget(areaOf(boardView(), ANA_CIRCLE_ID), SCENE);
    expect(target.cancelled()).toEqual({
      kind: 'effectAreaReshapePreviewed',
      effectAreaId: ANA_CIRCLE_ID,
      shape: null,
    });
  });
});

describe('effectAreaFacingTarget', () => {
  it.each([
    ['circle', anaCircle()],
    ['square', anaCircle({ kind: 'square', x: 2, y: 3, width: 3, height: 2 })],
    ['emanation', anaCircle({ kind: 'emanation', x: 5, y: 4, width: 1, height: 1, reach: 2 })],
  ])('a %s has no facing handle', (_kind, area) => {
    const view = boardView({ effectAreas: [area] });
    expect(effectAreaFacingTarget(areaOf(view, ANA_CIRCLE_ID))).toBeNull();
  });

  it('the handle of a cone sits past its reach in the direction it points', () => {
    const cone = biaCone({ kind: 'orthogonal_cone', x: 5, y: 5.5, reach: 3, facing: 0 });
    const target = effectAreaFacingTarget(areaOf(boardView({ effectAreas: [cone] }), BIA_CONE_ID));
    expect(target?.stem).toEqual({
      from: { x: 4.5 * C, y: 5.5 * C },
      to: { x: 4.5 * C + 3 * C + 20, y: 5.5 * C },
    });
  });

  it('turning an orthogonal cone snaps to a quarter turn and pivots on the cell it leaves', () => {
    const cone = biaCone({ kind: 'orthogonal_cone', x: 5, y: 5.5, reach: 3, facing: 0 });
    const target = effectAreaFacingTarget(areaOf(boardView({ effectAreas: [cone] }), BIA_CONE_ID));
    const below = { x: 4.7 * C, y: 9 * C };
    const facing = target?.facingAt(below, 0, false);
    expect(facing).toBe(90);
    expect(target?.turned(90)).toEqual({
      kind: 'effectAreaReshaped',
      effectAreaId: BIA_CONE_ID,
      shape: { kind: 'orthogonal_cone', x: 4.5, y: 6, reach: 3, facing: 90, color: 'ember' },
    });
  });

  it('a line turns freely, and Shift snaps it to 45°', () => {
    const line = biaCone({ kind: 'line', x: 2.5, y: 2.5, reach: 4, facing: 0 });
    const target = effectAreaFacingTarget(areaOf(boardView({ effectAreas: [line] }), BIA_CONE_ID));
    const pointer = { x: 5.5 * C, y: 4 * C };
    expect(target?.facingAt(pointer, 0, false)).toBe(27);
    expect(target?.facingAt(pointer, 0, true)).toBe(45);
  });

  it('letting go of the facing handle clears the preview', () => {
    const target = effectAreaFacingTarget(areaOf(boardView(), BIA_CONE_ID));
    expect(target?.previewed(null)).toEqual({
      kind: 'effectAreaReshapePreviewed',
      effectAreaId: BIA_CONE_ID,
      shape: null,
    });
  });
});
