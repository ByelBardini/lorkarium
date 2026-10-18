import { describe, expect, it } from 'vitest';
import { applyBoardEvent } from '@/stores/board-reducer';
import { PATH_ID, path, SQUARE_ID, square, vharnEventBase } from '../support/drawing-fixtures';
import {
  KAEL_ID,
  LYRA_ID,
  kael,
  lyra,
  sceneUpdated,
  VHARN_SCENE,
  vharnBoard,
  vharnCombat,
} from '../support/table-session-fixtures';

describe('applyBoardEvent, drawings', () => {
  it('drawing:createdMany appends the new drawings after the ones already there', () => {
    const board = vharnBoard({ drawings: [square()] });

    const next = applyBoardEvent(board, {
      type: 'drawingsCreated',
      payload: { ...vharnEventBase(5), drawings: [path()] },
    });

    expect(next.drawings.map(({ id }) => id)).toEqual([SQUARE_ID, PATH_ID]);
    expect(next.version).toBe(5);
  });

  it('drawing:movedMany changes only the corner of each moved drawing', () => {
    const board = vharnBoard({ drawings: [square(), path()] });

    const next = applyBoardEvent(board, {
      type: 'drawingsMoved',
      payload: { ...vharnEventBase(5), moves: [{ drawingId: PATH_ID, x: 7.5, y: 2 }] },
    });

    expect(next.drawings).toEqual([square(), path({ x: 7.5, y: 2 })]);
  });

  it('drawing:deletedMany takes the listed drawings off and keeps the rest', () => {
    const board = vharnBoard({ drawings: [square(), path()] });

    const next = applyBoardEvent(board, {
      type: 'drawingsDeleted',
      payload: { ...vharnEventBase(5), drawingIds: [SQUARE_ID] },
    });

    expect(next.drawings).toEqual([path()]);
  });
});

describe('applyBoardEvent, facing and look', () => {
  it('token:facedMany changes only the facing of the listed tokens', () => {
    const board = vharnBoard({ tokens: [lyra(), kael()] });

    const next = applyBoardEvent(board, {
      type: 'tokensFaced',
      payload: { ...vharnEventBase(5), faces: [{ tokenId: LYRA_ID, facing: 135 }] },
    });

    expect(next.tokens.map(({ id, facing }) => [id, facing])).toEqual([
      [LYRA_ID, 135],
      [KAEL_ID, 0],
    ]);
    expect(next.version).toBe(5);
  });

  it('token:resizedMany gives the listed tokens their new box and leaves the rest', () => {
    const board = vharnBoard({ tokens: [lyra(), kael()] });

    const next = applyBoardEvent(board, {
      type: 'tokensResized',
      payload: {
        ...vharnEventBase(5),
        resizes: [{ tokenId: LYRA_ID, col: 2.5, row: 4, width: 1.5, height: 0.5 }],
      },
    });

    expect(
      next.tokens.map(({ id, col, row, width, height }) => [id, col, row, width, height]),
    ).toEqual([
      [LYRA_ID, 2.5, 4, 1.5, 0.5],
      [KAEL_ID, 5, 4, 1, 1],
    ]);
  });

  it('token:restyledMany with a flip changes only the flip', () => {
    const board = vharnBoard({ tokens: [lyra({ frame: 'round' })] });

    const next = applyBoardEvent(board, {
      type: 'tokensRestyled',
      payload: { ...vharnEventBase(5), tokenIds: [LYRA_ID], style: { flipX: true } },
    });

    expect(next.tokens[0]).toMatchObject({ flipX: true, flipY: false, frame: 'round' });
  });

  it('token:restyledMany with a null image takes the image away', () => {
    const board = vharnBoard({ tokens: [lyra({ imageAssetId: KAEL_ID })] });

    const next = applyBoardEvent(board, {
      type: 'tokensRestyled',
      payload: { ...vharnEventBase(5), tokenIds: [LYRA_ID], style: { imageAssetId: null } },
    });

    expect(next.tokens[0]?.imageAssetId).toBeNull();
  });

  it('scene:updated with a background brings it into the scene', () => {
    const background = { assetId: KAEL_ID, width: 1400, height: 700 };
    const next = applyBoardEvent(vharnBoard(), {
      type: 'sceneUpdated',
      payload: sceneUpdated({ scene: { ...VHARN_SCENE, background } }),
    });

    expect(next.scene.background).toEqual(background);
  });
});

describe('applyBoardEvent, token batches', () => {
  it('token:createdMany appends every pasted token', () => {
    const board = vharnBoard({ tokens: [lyra()] });

    const next = applyBoardEvent(board, {
      type: 'tokensCreated',
      payload: { ...vharnEventBase(5), tokens: [kael()] },
    });

    expect(next.tokens.map(({ id }) => id)).toEqual([LYRA_ID, KAEL_ID]);
  });

  it('token:deletedMany takes the tokens off and brings the combat as it is after they left', () => {
    const board = vharnBoard({ tokens: [lyra(), kael()], combat: vharnCombat() });
    const after = vharnCombat({ currentCombatantId: null, combatants: [] });

    const next = applyBoardEvent(board, {
      type: 'tokensDeleted',
      payload: { ...vharnEventBase(5), tokenIds: [LYRA_ID, KAEL_ID], combat: after },
    });

    expect(next.tokens).toEqual([]);
    expect(next.combat).toEqual(after);
  });
});
