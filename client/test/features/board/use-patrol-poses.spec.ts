import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import type { TokenDto } from '@lorkarium/contracts';
import { usePatrolPoses } from '@/features/board/use-patrol-poses';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { InteractionClockFake } from '../../support/interaction-clock-fake';
import { squarePatrol } from '../../support/patrol-fixtures';
import { KAEL_ID, LYRA_ID, kael, lyra, vharnBoard } from '../../support/table-session-fixtures';

// The snapshot is stamped at SYNC_AT and arrives at once (offset = the fake clock's 0 − SYNC_AT):
// a patrol started 2500 ms before it is 2500 ms in at the fake clock's 0.
const SYNC_AT = '2026-11-08T12:00:02.500Z';
const STARTED_AT = '2026-11-08T12:00:00.000Z';

function onPatrol(token: TokenDto, speed = 1): TokenDto {
  return { ...token, col: 0, row: 0, patrol: squarePatrol({ speed, startedAt: STARTED_AT }) };
}

describe('usePatrolPoses', () => {
  let clock: InteractionClockFake;
  let board: StoreApi<BoardStore>;

  beforeEach(() => {
    clock = new InteractionClockFake();
    board = createBoardStore(VHARN.id, () => undefined, undefined, clock.now);
  });

  function sync(tokens: readonly TokenDto[]): void {
    board
      .getState()
      .apply({ kind: 'board', state: vharnBoard({ at: SYNC_AT, tokens: [...tokens] }) });
  }

  function mount() {
    return renderHook(() => usePatrolPoses(board, clock));
  }

  it('Kael 2500 ms into his square shows at (2, 0) and one timer waits the 500 ms to his next step', () => {
    sync([onPatrol(kael()), lyra()]);

    const { result } = mount();

    expect(result.current.get(KAEL_ID)).toMatchObject({ col: 2, row: 0 });
    expect(result.current.has(LYRA_ID)).toBe(false);
    expect(clock.pending()).toEqual([500]);
  });

  it('when the timer fires, Kael is on (2, 1)', () => {
    sync([onPatrol(kael()), onPatrol(lyra(), 0.5)]);
    const { result } = mount();

    act(() => clock.advance(500));

    expect(result.current.get(KAEL_ID)).toMatchObject({ col: 2, row: 1 });
  });

  it('with no patrol running no timer is asked and the poses stay the very same object', () => {
    sync([lyra()]);
    const { result, rerender } = mount();
    const first = result.current;

    rerender();

    expect(clock.pending()).toEqual([]);
    expect(result.current).toBe(first);
  });

  it('two patrols stepping at the same instant are delivered in one change of the board', () => {
    sync([onPatrol(kael()), onPatrol({ ...lyra(), id: LYRA_ID })]);
    mount();
    let changes = 0;
    const stop = board.subscribe((next, before) => {
      if (next.patrol.poses !== before.patrol.poses) changes += 1;
    });

    act(() => clock.advance(500));
    stop();

    expect(changes).toBe(1);
  });

  it('unmounted, the timer is cancelled', () => {
    sync([onPatrol(kael())]);
    const { unmount } = mount();

    unmount();

    expect(clock.pending()).toEqual([]);
  });
});
