import { act, render, screen } from '@testing-library/react';
import { Profiler } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { TurnLine } from '@/features/combat/turn-line';
import { createBoardInteractionStore } from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { RenderCounter } from '../../support/render-counter';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  eventAt,
  lyra,
  vharnBoard,
  vharnCombat,
  VHARN_GRID,
} from '../../support/table-session-fixtures';

const KAEL = lyra({ id: 'kael-token', name: 'Kael', canControl: true });

describe('TurnLine', () => {
  let board: StoreApi<BoardStore>;
  let renders: RenderCounter;

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    const interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands: new TableBoardCommandsFake(),
      describeRefusal: String,
    });
    const state = vharnBoard({ tokens: [KAEL, lyra()], combat: vharnCombat({ round: 2 }) });
    board.getState().apply({ kind: 'board', state });
    renders = new RenderCounter();
    render(
      <Profiler id="vez" onRender={renders.onRender}>
        <TurnLine board={board} interaction={interaction} />
      </Profiler>,
    );
    renders.count = 0;
  });

  function applied(event: Parameters<typeof eventAt>[1]): void {
    act(() => board.getState().apply({ kind: 'boardEvent', event: eventAt(5, event) }));
  }

  it('reads the round and whose turn it is', () => {
    expect(screen.getByLabelText('Rodada e vez')).toHaveTextContent('Rodada 2 · Vez de Kael');
  });

  it('a token moved on the board does not render the line', () => {
    applied({ type: 'tokensMoved', payload: { moves: [{ tokenId: KAEL.id, col: 9, row: 6 }] } });

    expect(renders.count).toBe(0);
  });

  it('the next round renders the line once, with the round', () => {
    applied({ type: 'combatUpdated', payload: { combat: vharnCombat({ round: 3 }) } });

    expect(renders.count).toBe(1);
    expect(screen.getByLabelText('Rodada e vez')).toHaveTextContent('Rodada 3');
  });
});
