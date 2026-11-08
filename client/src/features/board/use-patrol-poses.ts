import { useEffect } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { PatrolPoses } from '@/lib/patrol-poses';
import { useBoard, type BoardStore } from '@/stores/board-store';

/** Walks the patrols of a board: one timer up to the next step of any of them (never a loop per
 *  frame), and the board works the poses out again when it fires. Mount once per shown board; the
 *  poses are refreshed on mount, since a hidden tab's clock stood still.
 *
 *  Example: `const poses = usePatrolPoses(board, interactionClock)` */
export function usePatrolPoses(board: StoreApi<BoardStore>, clock: InteractionClock): PatrolPoses {
  const patrol = useBoard(board, (state) => state.patrol);
  useEffect(() => board.getState().stepPatrols(), [board]);
  useEffect(() => {
    if (patrol.nextChangeInMs === null) return;
    return clock.after(patrol.nextChangeInMs, () => board.getState().stepPatrols());
  }, [board, clock, patrol]);
  return patrol.poses;
}
