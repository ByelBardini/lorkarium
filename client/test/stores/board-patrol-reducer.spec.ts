import { describe, expect, it } from 'vitest';
import { applyBoardEvent } from '@/stores/board-reducer';
import { PATROL_STARTED_AT, patrolsChangedAt, squarePatrol } from '../support/patrol-fixtures';
import { corridorTorch } from '../support/light-fixtures';
import { northWall } from '../support/wall-fixtures';
import { square } from '../support/drawing-fixtures';
import {
  KAEL_ID,
  LYRA_ID,
  eventAt,
  kael,
  lyra,
  vharnBoard,
  vharnCombat,
} from '../support/table-session-fixtures';

const RUNNING = squarePatrol({ startedAt: PATROL_STARTED_AT });
const STRAY_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

function patrollingBoard() {
  return vharnBoard({
    tokens: [kael({ col: 0, row: 0, facing: 0, patrol: RUNNING }), lyra()],
    walls: [northWall()],
    lights: [corridorTorch()],
    drawings: [square()],
  });
}

describe('applyBoardEvent, token:patrolsChanged', () => {
  it('swaps the patrol and the saved pose of each token listed, and nothing else of it', () => {
    const board = vharnBoard({ tokens: [kael(), lyra()] });
    const event = patrolsChangedAt(5, [
      { tokenId: KAEL_ID, patrol: RUNNING, col: 4, row: 2, facing: 90 },
    ]);

    const next = applyBoardEvent(board, { type: 'tokenPatrolsChanged', payload: event });

    expect(next.tokens).toEqual([kael({ patrol: RUNNING, col: 4, row: 2, facing: 90 }), lyra()]);
    expect(next.version).toBe(5);
  });

  it('a patrol taken away leaves the token where the change says, with no patrol', () => {
    const event = patrolsChangedAt(5, [
      { tokenId: KAEL_ID, patrol: null, col: 2, row: 0, facing: 0 },
    ]);

    const next = applyBoardEvent(patrollingBoard(), {
      type: 'tokenPatrolsChanged',
      payload: event,
    });

    expect(next.tokens[0]).toMatchObject({ patrol: null, col: 2, row: 0, facing: 0 });
  });

  it('only the tokens array is new: walls, lights and drawings keep their reference (rule 2)', () => {
    const board = patrollingBoard();
    const event = patrolsChangedAt(5, [
      { tokenId: KAEL_ID, patrol: null, col: 2, row: 0, facing: 0 },
    ]);

    const next = applyBoardEvent(board, { type: 'tokenPatrolsChanged', payload: event });

    expect(next.tokens).not.toBe(board.tokens);
    expect(next.walls).toBe(board.walls);
    expect(next.lights).toBe(board.lights);
    expect(next.drawings).toBe(board.drawings);
    expect(next.veiledLights).toBe(board.veiledLights);
  });
});

describe('applyBoardEvent, the patrols an event paused', () => {
  const kaelPause = { tokenId: KAEL_ID, col: 2, row: 0, facing: 0, step: 2 };

  it('token:moved with a pause stops the patrol at its step and lands the token where it moved', () => {
    const next = applyBoardEvent(
      patrollingBoard(),
      eventAt(5, {
        type: 'tokenMoved',
        payload: { tokenId: KAEL_ID, col: 6, row: 3, patrolPauses: [kaelPause] },
      }),
    );

    expect(next.tokens[0]).toMatchObject({
      col: 6,
      row: 3,
      patrol: { ...RUNNING, startedAt: null, step: 2 },
    });
  });

  it('token:facedMany with a pause keeps the turn of the event at the cell the pause saved', () => {
    const next = applyBoardEvent(
      patrollingBoard(),
      eventAt(5, {
        type: 'tokensFaced',
        payload: { faces: [{ tokenId: KAEL_ID, facing: 180 }], patrolPauses: [kaelPause] },
      }),
    );

    expect(next.tokens[0]).toMatchObject({ col: 2, row: 0, facing: 180 });
    expect(next.tokens[0]?.patrol).toMatchObject({ startedAt: null, step: 2 });
  });

  it('combat:started with a pause stops the patrol of the token that entered the fight', () => {
    const next = applyBoardEvent(
      patrollingBoard(),
      eventAt(5, {
        type: 'combatStarted',
        payload: {
          combat: vharnCombat({ round: 2 }),
          patrolPauses: [{ ...kaelPause, col: 1, row: 0, step: 1 }],
        },
      }),
    );

    expect(next.tokens[0]).toMatchObject({ col: 1, row: 0, patrol: { startedAt: null, step: 1 } });
    expect(next.combat).toEqual(vharnCombat({ round: 2 }));
  });

  it('a pause of a token not on this board is ignored and the others stay as they were', () => {
    const board = patrollingBoard();

    const next = applyBoardEvent(
      board,
      eventAt(5, {
        type: 'tokenMoved',
        payload: {
          tokenId: LYRA_ID,
          col: 8,
          row: 6,
          patrolPauses: [{ ...kaelPause, tokenId: STRAY_ID }],
        },
      }),
    );

    expect(next.tokens[0]).toBe(board.tokens[0]);
    expect(next.tokens[1]).toMatchObject({ id: LYRA_ID, col: 8, row: 6 });
  });

  it('an event with no pause keeps every untouched token by reference', () => {
    const board = patrollingBoard();

    const next = applyBoardEvent(
      board,
      eventAt(5, { type: 'combatUpdated', payload: { combat: vharnCombat() } }),
    );

    expect(next.tokens).toBe(board.tokens);
  });
});
