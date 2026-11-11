import type { StoreApi } from 'zustand/vanilla';
import { useTokensBesidesPose } from '@/features/board/use-board-tokens';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import { ConditionPicker } from './condition-picker';

export type SelectionConditionsProps = Readonly<{
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
}>;

/** With 2 or more selected, one condition on all of them in one `condition:applyMany`, whoever
 *  controls them (master and players alike act on any token's conditions). Nothing read-only.
 *
 *  Example: `<SelectionConditions board={board} interaction={interaction} isMaster />` */
export function SelectionConditions(props: SelectionConditionsProps): React.JSX.Element | null {
  const { board, interaction, isMaster } = props;
  const selectedIds = useBoardInteraction(interaction, (state) => state.selectedTokenIds);
  const readOnly = useBoardInteraction(interaction, (state) => state.readOnly);
  const tokens = useTokensBesidesPose(board);
  if (selectedIds.length < 2 || readOnly) return null;
  const targets = tokens.filter(({ id }) => selectedIds.includes(id)).map(({ id }) => id);
  if (targets.length < 2) return null;
  return (
    <section aria-label="Condição nos selecionados" className="flex flex-col gap-2 pb-2">
      <ConditionPicker
        board={board}
        interaction={interaction}
        isMaster={isMaster}
        disabled={false}
        label={`Condição em ${targets.length} tokens`}
        onApply={(conditionId, rounds) =>
          interaction
            .getState()
            .command((c, id) => c.applyConditions(id, targets, conditionId, rounds))
        }
      />
    </section>
  );
}
