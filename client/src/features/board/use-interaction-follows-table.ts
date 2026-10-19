import type { BoardStateDto } from '@lorkarium/contracts';
import { useEffect } from 'react';
import { seenTokensOf, type BoardSight } from '@/lib/board-sight';
import { entryLabelOf, OUT_OF_SIGHT_LABEL } from '@/lib/combat-entries';
import type { StoreApi } from 'zustand/vanilla';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import type { TablePresenceStore } from '@/stores/table-presence-store';
import { sightNowOf } from './use-board-sight';

export type FollowedTable = Readonly<{
  presence: StoreApi<TablePresenceStore>;
  board: StoreApi<BoardStore>;
}>;

/** Keeps the local interaction in step with the table: read only unless the connection is live
 *  (no command queue, spec §5.6), every new snapshot voids the move preview, a scene back to
 *  vision off ends the master's sight preview, and a turn that moves is said on the status line
 *  (by the entry's label, through the sight filter).
 *
 *  Example: `useInteractionFollowsTable(view.kind === 'open' ? view : null, interaction)` */
export function useInteractionFollowsTable(
  table: FollowedTable | null,
  interaction: StoreApi<BoardInteractionStore>,
): void {
  const presence = table?.presence;
  const board = table?.board;
  useEffect(() => {
    if (!presence || !board) return;
    const followStatus = (): void =>
      interaction.getState().setReadOnly(presence.getState().status !== 'live');
    followStatus();
    const stopStatus = presence.subscribe(followStatus);
    const stopSnapshots = board.subscribe((next, previous) => {
      interaction.getState().followVision(next.board?.scene.vision);
      if (next.snapshots !== previous.snapshots) return interaction.getState().dropPreview();
      const sight = sightNowOf(next.board, interaction.getState());
      const announcement = turnAnnouncement(previous.board, next.board, sight);
      if (announcement) interaction.getState().say(announcement);
    });
    return () => {
      stopStatus();
      stopSnapshots();
    };
  }, [presence, board, interaction]);
}

// "Vez de Inimigos." when a confirmed event (not a snapshot) moves the turn to another entry; an
// entry whose tokens this viewer does not see is announced without naming them.
function turnAnnouncement(
  before: BoardStateDto | null,
  after: BoardStateDto | null,
  sight: BoardSight,
): string | null {
  const now = after?.combat?.currentCombatantId;
  if (!after || !now || now === before?.combat?.currentCombatantId) return null;
  const entry = after.combat?.combatants.find(({ id }) => id === now);
  if (!entry) return null;
  const label = entryLabelOf(entry, seenTokensOf(after, sight));
  return label === OUT_OF_SIGHT_LABEL ? 'Vez de alguém fora de vista.' : `Vez de ${label}.`;
}
