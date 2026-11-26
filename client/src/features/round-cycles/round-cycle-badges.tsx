import { useMemo } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { cycleBadgesOf } from '@/lib/round-cycle-view';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useCharacters, type CharactersStore } from '@/stores/characters-store';
import { CycleBadge } from './cycle-badge';

export type RoundCycleBadgesProps = Readonly<{
  /** The grid shown: only the cycles in its combat get a badge. */
  board: StoreApi<BoardStore>;
  /** The table stream, which holds the cycles this viewer sees. */
  characters: StoreApi<CharactersStore>;
  /** Where the pick is sent from (a refusal goes to its status line). */
  interaction: StoreApi<BoardInteractionStore>;
}>;

/** The badges of the round cycles in the combat of the grid shown, stacked at the top of the
 *  board. Nothing while no cycle this viewer sees plays here.
 *
 *  Example: `<RoundCycleBadges board={table.board} characters={table.characters} interaction={interaction} />` */
export function RoundCycleBadges(props: RoundCycleBadgesProps): React.JSX.Element | null {
  const sceneId = useBoard(props.board, (state) => state.board?.scene.id ?? null);
  const cycles = useCharacters(props.characters, (state) => state.roundCycles);
  const badges = useMemo(
    () => (sceneId === null ? [] : cycleBadgesOf(cycles, sceneId)),
    [cycles, sceneId],
  );
  if (badges.length === 0) return null;
  const choose = (cycleId: string, phaseId: string | null): Promise<boolean> =>
    props.interaction
      .getState()
      .command((commands, scope) => commands.chooseNextPhase(scope, cycleId, phaseId));
  return (
    <div className="pointer-events-none absolute top-3 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2">
      {badges.map((badge) => (
        <CycleBadge
          key={badge.cycleId}
          badge={badge}
          onPick={(phaseId) => choose(badge.cycleId, phaseId)}
        />
      ))}
    </div>
  );
}
