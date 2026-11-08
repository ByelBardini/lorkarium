import { act, renderHook } from '@testing-library/react';
import { cell } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { useRoomPatrolEditor } from '@/features/tokens/use-room-patrol-editor';
import { createBoardInteractionStore } from '@/stores/board-interaction-store';
import { createBoardStore } from '@/stores/board-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { InteractionClockFake } from '../../support/interaction-clock-fake';
import { squarePatrol } from '../../support/patrol-fixtures';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { KAEL_ID, VHARN_GRID, kael, vharnBoard } from '../../support/table-session-fixtures';

// The snapshot is stamped 2500 ms after the patrol started: Kael walks on (2, 0) of his square.
const SYNC_AT = '2026-11-08T12:00:02.500Z';

function roomWith(tokens = [kael({ col: 4, row: 4 })]) {
  const clock = new InteractionClockFake();
  const board = createBoardStore(VHARN.id, () => undefined, undefined, clock.now);
  board.getState().apply({ kind: 'board', state: vharnBoard({ at: SYNC_AT, tokens }) });
  const commands = new TableBoardCommandsFake();
  const interaction = createBoardInteractionStore({
    scopeOf: () => VHARN_GRID,
    commands,
    describeRefusal: String,
  });
  return { board, commands, interaction, scopeOf: () => VHARN_GRID };
}

describe('useRoomPatrolEditor', () => {
  it('opens on the token of the grid shown, with the route starting on its cell', () => {
    const room = roomWith();
    const { result } = renderHook(() => useRoomPatrolEditor(room));

    act(() => result.current.open(KAEL_ID));

    expect(result.current.editor.getState().draft).toMatchObject({
      tokenId: KAEL_ID,
      scope: VHARN_GRID,
      path: [cell(4, 4)],
    });
  });

  it('a patrolling token redraws from where it walks now, not from where its patrol was saved', () => {
    const patrol = squarePatrol({ startedAt: '2026-11-08T12:00:00.000Z' });
    const room = roomWith([kael({ col: 0, row: 0, patrol })]);
    const { result } = renderHook(() => useRoomPatrolEditor(room));

    act(() => result.current.open(KAEL_ID));

    expect(result.current.editor.getState().draft?.origin).toEqual(cell(2, 0));
  });

  it('the status line of the grid hears the 33rd point', () => {
    const room = roomWith();
    const { result } = renderHook(() => useRoomPatrolEditor(room));
    act(() => result.current.open(KAEL_ID));

    act(() => {
      for (let index = 1; index <= 32; index += 1) {
        result.current.editor.getState().addPoint(cell(index % 2, 0));
      }
    });

    expect(room.interaction.getState().notice).toBe('Até 32 pontos.');
  });

  it('another grid shown closes the editor', () => {
    const room = roomWith();
    const other = roomWith();
    const { result, rerender } = renderHook((deps) => useRoomPatrolEditor(deps), {
      initialProps: room,
    });
    act(() => result.current.open(KAEL_ID));

    rerender({ ...room, board: other.board });

    expect(result.current.editor.getState().draft).toBeNull();
  });
});
