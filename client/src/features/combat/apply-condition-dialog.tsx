import type { StoreApi } from 'zustand/vanilla';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { ConditionPicker } from './condition-picker';

export type ApplyConditionDialogProps = Readonly<{
  tokenIds: readonly string[];
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
  onClose: () => void;
}>;

/** "Aplicar condição" from the token's right click: one condition on the tokens given, in one
 *  `condition:applyMany`; closes once confirmed. Mounted only while open.
 *
 *  Example: `{targets && <ApplyConditionDialog tokenIds={targets} board={board} interaction={interaction} isMaster onClose={close} />}` */
export function ApplyConditionDialog(props: ApplyConditionDialogProps): React.JSX.Element {
  const { tokenIds, board, interaction, isMaster, onClose } = props;
  const readOnly = useBoardInteraction(interaction, (state) => state.readOnly);
  const firstName = useBoard(
    board,
    (state) => state.board?.tokens.find(({ id }) => id === tokenIds[0])?.name ?? '',
  );
  const apply = async (conditionId: string, rounds: number): Promise<boolean> => {
    const send = interaction.getState().command;
    const confirmed = await send((c, id) => c.applyConditions(id, tokenIds, conditionId, rounds));
    if (confirmed) onClose();
    return confirmed;
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Aplicar condição</DialogTitle>
          <DialogDescription>
            {tokenIds.length === 1 ? `Em ${firstName}.` : `Nos ${tokenIds.length} selecionados.`}
          </DialogDescription>
        </DialogHeader>
        <ConditionPicker
          board={board}
          interaction={interaction}
          isMaster={isMaster}
          disabled={readOnly}
          label="Condição"
          onApply={apply}
        />
      </DialogContent>
    </Dialog>
  );
}
