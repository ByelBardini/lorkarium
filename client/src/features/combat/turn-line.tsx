import { useMemo } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { seenTokensOf } from '@/lib/board-sight';
import { cn } from '@/lib/utils';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useBoardSeen } from '@/features/board/use-board-sight';
import { useTokensBesidesPose } from '@/features/board/use-board-tokens';
import { combatSummaryOf, turnLine } from './combat-view';

export type TurnLineProps = Readonly<{
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  className?: string;
}>;

/** "Rodada 3 · Vez de Inimigos" in text, for the top bar and for focus mode; nothing out of combat.
 *  The entry is named through the sight filter, so a hidden token is never named.
 *
 *  Example: `<TurnLine board={board} interaction={interaction} />` */
export function TurnLine({ board, interaction, className }: TurnLineProps) {
  const combat = useBoard(board, (current) => current.board?.combat ?? null);
  const tokens = useTokensBesidesPose(board);
  const sight = useBoardSeen(board, interaction);
  const summary = useMemo(
    () => combatSummaryOf({ combat }, seenTokensOf({ tokens }, sight)),
    [combat, tokens, sight],
  );
  if (!summary) return null;
  return (
    <p aria-label="Rodada e vez" className={cn('shrink-0 text-sm text-label', className)}>
      {turnLine(summary)}
    </p>
  );
}
