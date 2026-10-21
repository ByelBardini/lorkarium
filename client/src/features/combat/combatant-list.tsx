import type { CombatDto } from '@lorkarium/contracts';
import { useMemo, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { useBoardSight } from '@/features/board/use-board-sight';
import { seenTokensOf } from '@/lib/board-sight';
import { trackerRowsOf } from '@/lib/combat-rows';
import {
  singleSelectedOf,
  useBoardInteraction,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useTablePresence, type TablePresenceStore } from '@/stores/table-presence-store';
import { CombatantRow } from './combatant-row';
import { SelectionConditions } from './selection-conditions';

export type CombatantListProps = Readonly<{
  board: StoreApi<BoardStore>;
  presence: StoreApi<TablePresenceStore>;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
}>;

/** A group opened or closed by hand, valid for the turn it was done in. */
type Folding = Readonly<{ open: boolean; turn: string }>;

/** The tracker: the initiative entries in the server's order, as a list with rules (no cards),
 *  each named and listed through the sight filter. A group opens by itself on its turn; folded or
 *  opened by hand, it stays so until the turn moves.
 *
 *  Example: `<CombatantList board={board} presence={presence} interaction={interaction} isMaster />` */
export function CombatantList(props: CombatantListProps): React.JSX.Element | null {
  const state = useBoard(props.board, (current) => current.board);
  const sight = useBoardSight(props.board, props.interaction);
  const members = useTablePresence(props.presence, (current) => current.members);
  const selected = useBoardInteraction(props.interaction, (current) =>
    singleSelectedOf(current.selectedTokenIds),
  );
  const folding = useGroupFolding(state?.combat ?? null);
  const rows = useMemo(
    () => (state ? trackerRowsOf(state, seenTokensOf(state, sight), props.isMaster) : []),
    [state, sight, props.isMaster],
  );
  const combat = state?.combat;
  if (!state || !combat) return null;
  return (
    <div className="flex flex-col gap-3">
      <SelectionConditions
        board={props.board}
        interaction={props.interaction}
        isMaster={props.isMaster}
      />
      <ol aria-label="Ordem de iniciativa" className="flex flex-col">
        {rows.map((row) => (
          <CombatantRow
            key={row.combatant.id}
            {...row}
            current={row.combatant.id === combat.currentCombatantId}
            open={folding.openOf(row.combatant.id)}
            onToggle={() => folding.toggle(row.combatant.id)}
            selectedTokenId={selected}
            members={members}
            interaction={props.interaction}
            isMaster={props.isMaster}
          />
        ))}
      </ol>
    </div>
  );
}

type GroupFolding = Readonly<{ openOf: (id: string) => boolean; toggle: (id: string) => void }>;

function useGroupFolding(combat: CombatDto | null): GroupFolding {
  const [byHand, setByHand] = useState<Readonly<Record<string, Folding>>>({});
  const turn = combat ? turnKeyOf(combat) : '';
  const openOf = (id: string): boolean => {
    const folded = byHand[id];
    return folded?.turn === turn ? folded.open : id === combat?.currentCombatantId;
  };
  const toggle = (id: string): void => setByHand({ ...byHand, [id]: { open: !openOf(id), turn } });
  return { openOf, toggle };
}

function turnKeyOf(combat: CombatDto): string {
  return `${combat.round}:${combat.currentCombatantId ?? ''}`;
}
