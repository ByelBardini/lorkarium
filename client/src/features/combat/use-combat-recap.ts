import { useEffect, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { sightNowOf } from '@/features/board/use-board-sight';
import { seenTokensOf } from '@/lib/board-sight';
import { combatRecapOf } from '@/lib/combat-recap';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';

/** What the last confirmed change of turn told, until the next one replaces it; `ended` when it
 *  was the end of the combat (shown out of combat until dismissed). */
export type CombatRecap = Readonly<{
  lines: readonly string[];
  ended: boolean;
  dismiss: () => void;
}>;

/** Follows the board for the recap of each change of turn (never a snapshot), named through the
 *  sight filter. Lives in the panel, not in the interaction store: it is only a view of events.
 *
 *  Example: `const recap = useCombatRecap(board, interaction)` */
export function useCombatRecap(
  board: StoreApi<BoardStore>,
  interaction: StoreApi<BoardInteractionStore>,
): CombatRecap {
  const [told, setTold] = useState<Readonly<{ lines: readonly string[]; ended: boolean }>>({
    lines: [],
    ended: false,
  });
  useEffect(
    () =>
      board.subscribe((next, previous) => {
        if (!previous.board?.combat && next.board?.combat)
          return setTold({ lines: [], ended: false });
        const seen = next.board
          ? seenTokensOf(next.board, sightNowOf(next, interaction.getState()))
          : [];
        const lines = combatRecapOf(previous, next, seen);
        if (lines) setTold({ lines, ended: !next.board?.combat });
      }),
    [board, interaction],
  );
  return { ...told, dismiss: () => setTold({ lines: [], ended: false }) };
}
