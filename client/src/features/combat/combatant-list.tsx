import type { BoardStateDto, TokenDto } from '@lorkarium/contracts';
import { PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import {
  singleSelectedOf,
  useBoardInteraction,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useBoardSight } from '@/features/board/use-board-sight';
import { seenTokensOf } from '@/lib/board-sight';
import { CombatantRow, type CombatantRowProps } from './combatant-row';
import { SelectionConditions } from './selection-conditions';
import {
  canRunEntry,
  combatCandidatesOf,
  entryLabelOf,
  entryOfToken,
  entryTokensOf,
  soloEntriesOf,
} from '@/lib/combat-entries';
import { AddCombatantsDialog } from './add-combatants-dialog';
import type { EntryChoice } from './token-in-combat-menu';
import { TokenlessEntryForm } from './tokenless-entry-form';

export type CombatantListProps = Readonly<{
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
  onEditToken: (tokenId: string) => void;
}>;

/** The tracker: the initiative entries in the server's order, as a list with rules (no cards),
 *  each named and listed through the sight filter, and "+ Adicionar ao combate" (master).
 *
 *  Example: `<CombatantList board={board} interaction={interaction} isMaster onEditToken={edit} />` */
export function CombatantList(props: CombatantListProps): React.JSX.Element | null {
  const state = useBoard(props.board, (current) => current.board);
  const sight = useBoardSight(props.board, props.interaction);
  const selected = useBoardInteraction(props.interaction, (current) =>
    singleSelectedOf(current.selectedTokenIds),
  );
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
            board={props.board}
            current={row.combatant.id === combat.currentCombatantId}
            selectedTokenId={selected}
            interaction={props.interaction}
            isMaster={props.isMaster}
            onEditToken={props.onEditToken}
          />
        ))}
      </ol>
      {props.isMaster && (
        <AddCombatants
          state={state}
          entries={rows.map(({ combatant, label }) => ({ id: combatant.id, label }))}
          interaction={props.interaction}
        />
      )}
    </div>
  );
}

type TrackerRow = Pick<
  CombatantRowProps,
  'combatant' | 'label' | 'tokens' | 'others' | 'canRun' | 'tiedAbove' | 'tiedBelow'
>;

function trackerRowsOf(
  state: BoardStateDto,
  seenTokens: readonly TokenDto[],
  isMaster: boolean,
): TrackerRow[] {
  const combatants = state.combat?.combatants ?? [];
  const labels = combatants.map((entry) => ({
    id: entry.id,
    label: entryLabelOf(entry, seenTokens),
  }));
  return combatants.map((combatant, index) => {
    const tied = (offset: number): boolean =>
      combatants[index + offset]?.initiative === combatant.initiative;
    return {
      combatant,
      label: labels[index]?.label ?? '',
      tokens: entryTokensOf(combatant, seenTokens),
      others: labels.filter(({ id }) => id !== combatant.id),
      canRun: canRunEntry(combatant, state.tokens, isMaster),
      tiedAbove: tied(-1),
      tiedBelow: tied(1),
    };
  });
}

type AddCombatantsProps = Readonly<{
  state: BoardStateDto;
  entries: readonly EntryChoice[];
  interaction: StoreApi<BoardInteractionStore>;
}>;

function AddCombatants({ state, entries, interaction }: AddCombatantsProps) {
  const [choosing, setChoosing] = useState(false);
  const readOnly = useBoardInteraction(interaction, (current) => current.readOnly);
  const outside = combatCandidatesOf(state.tokens).filter(
    (token) => entryOfToken(state.combat, token.id) === null,
  );
  const send = interaction.getState().command;
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={readOnly || outside.length === 0}
        onClick={() => setChoosing(true)}
      >
        <PlusIcon aria-hidden="true" />
        Adicionar ao combate
      </Button>
      <TokenlessEntryForm
        disabled={readOnly}
        onCreate={(name) => void send((c, id) => c.addCombatants(id, [{ name, tokenIds: [] }]))}
      />
      {choosing && (
        <AddCombatantsDialog
          tokens={outside}
          entries={entries}
          onAddAlone={(tokenIds) => {
            setChoosing(false);
            void send((c, id) => c.addCombatants(id, soloEntriesOf(tokenIds)));
          }}
          onJoin={(tokenIds, combatantId) => {
            setChoosing(false);
            void send((c, id) => c.regroupTokens(id, tokenIds, { kind: 'entry', combatantId }));
          }}
          onClose={() => setChoosing(false)}
        />
      )}
    </div>
  );
}
