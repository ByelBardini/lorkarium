import { useEffect, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { usePlanLock } from '@/features/plans/use-plan-limits';
import type { PlanGate } from '@/features/plans/plan-gate';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';

/** The setup lock of the grid shown: closed, with the readOnly sentence, when the server marked
 *  its scene `planLocked` (past the owner's plan). While closed the walls editor cannot stay
 *  picked: Paredes, from the toolbar or its key, falls back to Selecionar and says why. Doors,
 *  vision and play stay free.
 *
 *  Example: `const setupLock = useGridSetupLock(table?.board ?? null, interaction)` */
export function useGridSetupLock(
  board: StoreApi<BoardStore> | null,
  interaction: StoreApi<BoardInteractionStore>,
): PlanGate {
  const lock = usePlanLock('scenes', { planLocked: usePlanLocked(board) });
  const hint = lock.open ? null : lock.hint;
  useEffect(() => {
    if (hint === null) return;
    const dropWalls = (): void => {
      const state = interaction.getState();
      if (state.tool !== 'walls') return;
      state.setTool('select');
      state.say(hint);
    };
    dropWalls();
    return interaction.subscribe(dropWalls);
  }, [interaction, hint]);
  return lock;
}

// A boolean, not the scene: a token moving on the board does not render the room again.
function usePlanLocked(board: StoreApi<BoardStore> | null): boolean {
  const [planLocked, setPlanLocked] = useState(false);
  useEffect(() => {
    const follow = (): void => setPlanLocked(board?.getState().board?.scene.planLocked ?? false);
    follow();
    return board?.subscribe(follow);
  }, [board]);
  return planLocked;
}
