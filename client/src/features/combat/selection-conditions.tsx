import type { TokenDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { ConditionPicker } from './condition-picker';

export type SelectionConditionsProps = Readonly<{
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
}>;

const NO_TOKENS: readonly TokenDto[] = [];

/** With 2 or more selected, one condition on all of them in one `condition:applyMany`. Only the
 *  tokens the viewer controls go: the server refuses the whole group for one that is not theirs.
 *
 *  Example: `<SelectionConditions board={board} interaction={interaction} isMaster />` */
export function SelectionConditions(props: SelectionConditionsProps): React.JSX.Element | null {
  const { board, interaction, isMaster } = props;
  const selectedIds = useBoardInteraction(interaction, (state) => state.selectedTokenIds);
  const readOnly = useBoardInteraction(interaction, (state) => state.readOnly);
  const tokens = useBoard(board, (state) => state.board?.tokens ?? NO_TOKENS);
  if (selectedIds.length < 2) return null;
  const targets = tokens
    .filter(({ id, canControl }) => canControl && selectedIds.includes(id))
    .map(({ id }) => id);
  if (targets.length === 0) return null;
  const leftOut = selectedIds.length - targets.length;
  return (
    <section aria-label="Condição nos selecionados" className="flex flex-col gap-2 pb-2">
      {leftOut > 0 && <p className="text-[13px] text-muted-foreground">{leftOutText(leftOut)}</p>}
      <ConditionPicker
        board={board}
        interaction={interaction}
        isMaster={isMaster}
        disabled={readOnly}
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

function leftOutText(count: number): string {
  return count === 1
    ? '1 selecionado não é seu e fica de fora.'
    : `${count} selecionados não são seus e ficam de fora.`;
}
