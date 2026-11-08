import { insidePolygon } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DRAWING_STYLE } from '@/lib/drawing-style';
import { boardSightOf } from '@/lib/board-sight';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { buildBoardView, type BoardViewInput } from '@/renderer/board-view';
import { corridorTorch } from '../support/light-fixtures';
import {
  LOOKOUT_BOARD_VIEWER,
  STATUE_ID,
  TRACED_ASSET_ID,
  blockerBoard,
  lookout,
  ogre,
  statue,
  tracedOutlines,
} from '../support/sight-blocker-fixtures';
import { BIA_AT_TABLE, LYRA_ID, VHARN_SCENE } from '../support/table-session-fixtures';

const CELL = CELL_WORLD_SIZE;
const DARK = { ...VHARN_SCENE, vision: 'dark' as const };
const TOKENS = [lookout(), statue(), ogre()];

function inputOf(overrides: Partial<BoardViewInput> = {}): BoardViewInput {
  return {
    scene: DARK,
    tokens: TOKENS,
    drawings: [],
    viewer: LOOKOUT_BOARD_VIEWER,
    drawingStyle: DEFAULT_DRAWING_STYLE,
    localGridVisible: true,
    ruler: null,
    selectedTokenIds: [],
    selectedDrawingIds: [],
    drawingPreview: [],
    activeLayer: 'tokens',
    canChooseLayer: false,
    preview: [],
    facingPreview: {},
    resizePreview: {},
    drag: null,
    dragged: {},
    readOnly: false,
    tool: 'select',
    currentTokenIds: [],
    ...overrides,
  };
}

function reaches(area: readonly { x: number; y: number }[] | undefined, x: number, y: number) {
  return insidePolygon({ x: x * CELL, y: y * CELL }, area ?? []);
}

describe('buildBoardView with a statue', () => {
  const SIGHT = boardSightOf(blockerBoard(TOKENS), { previewEyeIds: null });

  it('the fog of the player stops at the statue and opens its body', () => {
    const { fog } = buildBoardView(inputOf({ sight: SIGHT }));

    expect(reaches(fog?.dim[0], 7.5, 5.5)).toBe(false);
    expect(fog?.blockerHoles.dim).toHaveLength(1);
  });

  it('only the ruler changing hands back the very same fog and tint', () => {
    const lights = [corridorTorch({ color: 'infernal' })];
    const first = buildBoardView(inputOf({ sight: SIGHT, lights }));

    const ruled = buildBoardView(
      inputOf({
        sight: SIGHT,
        lights,
        ruler: { from: { col: 0, row: 0 }, to: { col: 3, row: 0 } },
      }),
    );

    expect(ruled.fog).toBe(first.fog);
    expect(ruled.lightTint).toBe(first.lightTint);
  });

  it('the outlines given reach the views: a traced statue lets the fog through', () => {
    const tokens = [lookout(), statue({ imageAssetId: TRACED_ASSET_ID }), ogre()];
    const outlines = tracedOutlines();
    const sight = boardSightOf(blockerBoard(tokens), { previewEyeIds: null, outlines });

    const { fog } = buildBoardView(inputOf({ tokens, sight, sightOutlines: outlines }));

    expect(reaches(fog?.dim[0], 7.5, 5.5)).toBe(true);
  });

  it('the statue this viewer drags cuts from where it shows', () => {
    const { fog } = buildBoardView(
      inputOf({ sight: SIGHT, dragged: { [STATUE_ID]: { col: 4, row: 9 } } }),
    );

    expect(reaches(fog?.dim[0], 7.5, 5.5)).toBe(true);
  });

  it('with no walls in the input, the view does not redo its memory', () => {
    const first = buildBoardView(inputOf({ sight: SIGHT }));

    expect(buildBoardView(inputOf({ sight: SIGHT })).fog).toBe(first.fog);
  });
});

describe('buildBoardView for the master, not filtered', () => {
  const MASTER = { userId: 'ana', isMaster: true };

  it('the tint is cut by the statue all the same', () => {
    const lights = [corridorTorch({ x: 2.5, y: 5.5, bright: 6, dim: 0, color: 'infernal' })];

    const { lightTint, fog } = buildBoardView(inputOf({ viewer: MASTER, lights }));

    expect(fog).toBeNull();
    expect(reaches(lightTint?.tints[0]?.dim, 3.5, 5.5)).toBe(true);
    expect(reaches(lightTint?.tints[0]?.dim, 6.5, 5.5)).toBe(false);
  });

  it('what a light lights with the lights tool is cut by it too', () => {
    const lights = [corridorTorch({ x: 2.5, y: 5.5, bright: 6, dim: 0 })];

    const view = buildBoardView(inputOf({ viewer: MASTER, lights, tool: 'lights' }));

    expect(reaches(view.lights[0]?.areas?.dim, 3.5, 5.5)).toBe(true);
    expect(reaches(view.lights[0]?.areas?.dim, 6.5, 5.5)).toBe(false);
  });

  it('the outline of the field of view is cut by it too', () => {
    const narrow = lookout({ sightAngle: 90 });
    const view = buildBoardView(
      inputOf({
        viewer: MASTER,
        tokens: [narrow, statue(), ogre()],
        selectedTokenIds: [LYRA_ID],
      }),
    );

    expect(reaches(view.sightCone?.outline, 3.5, 5.5)).toBe(true);
    expect(reaches(view.sightCone?.outline, 6.5, 5.5)).toBe(false);
  });

  it('a player sees the same tint', () => {
    const lights = [corridorTorch({ x: 2.5, y: 5.5, bright: 6, dim: 0, color: 'infernal' })];
    const viewer = { userId: BIA_AT_TABLE.userId, isMaster: false };

    const { lightTint } = buildBoardView(inputOf({ viewer, lights }));

    expect(reaches(lightTint?.tints[0]?.dim, 6.5, 5.5)).toBe(false);
  });
});
