import { act, renderHook } from '@testing-library/react';
import { PLAN_LIMITS } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { useGridSetupLock } from '@/features/board/use-grid-setup-lock';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { onTablePlan } from '../../support/table-plan';
import { VHARN_GRID, VHARN_SCENE, vharnBoard } from '../../support/table-session-fixtures';
import { cellDoor } from '../../support/wall-fixtures';

const READ_ONLY =
  'Este grid passou do limite do plano Grátis (3) e está só leitura. Apague um grid mais antigo ou suba de plano.';

describe('useGridSetupLock', () => {
  let board: StoreApi<BoardStore>;
  let commands: TableBoardCommandsFake;
  let interaction: StoreApi<BoardInteractionStore>;

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: String,
    });
    // The master's: only they may pick Paredes.
    interaction.getState().allowLayerChoice(true);
  });

  function openGrid(planLocked: boolean): void {
    const scene = { ...VHARN_SCENE, planLocked };
    board.getState().apply({ kind: 'board', state: vharnBoard({ scene, walls: [cellDoor()] }) });
  }

  function renderLock() {
    return renderHook(() => useGridSetupLock(board, interaction), {
      wrapper: ({ children }) => onTablePlan(PLAN_LIMITS.free, children),
    });
  }

  it('on a grid past the plan the gate is closed with the readOnly sentence', () => {
    openGrid(true);

    expect(renderLock().result.current).toEqual({ open: false, hint: READ_ONLY });
  });

  it('on a grid within the plan the gate is open', () => {
    openGrid(false);

    expect(renderLock().result.current.open).toBe(true);
  });

  it('picking Paredes on a locked grid falls back to Selecionar and says the sentence', () => {
    openGrid(true);
    renderLock();

    act(() => interaction.getState().setTool('walls'));

    expect(interaction.getState().tool).toBe('select');
    expect(interaction.getState().notice).toBe(READ_ONLY);
  });

  it('picking Paredes on a grid within the plan keeps it', () => {
    openGrid(false);
    renderLock();

    act(() => interaction.getState().setTool('walls'));

    expect(interaction.getState().tool).toBe('walls');
  });

  it('a grid that turns locked while Paredes is picked drops the tool', () => {
    openGrid(false);
    renderLock();
    act(() => interaction.getState().setTool('walls'));

    act(() => openGrid(true));

    expect(interaction.getState().tool).toBe('select');
  });

  it('on a locked grid a door still opens: setDoor is sent', async () => {
    openGrid(true);
    renderLock();

    await act(() => interaction.getState().toggleDoor(cellDoor()));

    expect(commands.sent).toEqual([
      { name: 'setDoor', ...VHARN_GRID, fields: { wallId: cellDoor().id, state: 'open' } },
    ]);
  });
});
