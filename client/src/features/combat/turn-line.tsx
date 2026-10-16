import { useMemo } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { cn } from '@/lib/utils';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { combatSummaryOf, turnLine } from './combat-view';

export type TurnLineProps = Readonly<{ board: StoreApi<BoardStore>; className?: string }>;

/** "Rodada 3 · Vez de Kael" in text, for the top bar and for focus mode; nothing out of combat.
 *
 *  Example: `<TurnLine board={board} />` */
export function TurnLine({ board, className }: TurnLineProps): React.JSX.Element | null {
  const state = useBoard(board, (current) => current.board);
  const summary = useMemo(() => combatSummaryOf(state), [state]);
  if (!summary) return null;
  return (
    <p aria-label="Rodada e vez" className={cn('shrink-0 text-sm text-label', className)}>
      {turnLine(summary)}
    </p>
  );
}
