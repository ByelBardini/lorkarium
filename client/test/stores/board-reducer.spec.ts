import { describe, expect, it } from 'vitest';
import { applyBoardEvent } from '@/stores/board-reducer';
import { PATH_ID, path, SQUARE_ID, square, vharnEventBase } from '../support/drawing-fixtures';
import {
  KAEL_ID,
  LYRA_ID,
  kael,
  lyra,
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
