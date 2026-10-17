import type { TokenDto } from '@lorkarium/contracts';
import { XIcon } from 'lucide-react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import { ConditionMark } from './condition-marks';
import { ConditionPicker } from './condition-picker';
import { conditionLabel } from './combat-view';

export type ConditionsEditorProps = Readonly<{
  token: TokenDto;
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
}>;

/** "Condições" of a token: the active ones in text with their mark and rounds; for the master and
 *  the controllers, "Adicionar condição" (a typed name; 0 rounds = no limit) and "Remover"; a
 *  name not on the list is created by the master on the way.
 *
 *  Example: `<ConditionsEditor token={token} board={board} interaction={interaction} isMaster />` */
export function ConditionsEditor({ token, board, interaction, isMaster }: ConditionsEditorProps) {
  const readOnly = useBoardInteraction(interaction, (state) => state.readOnly);
  const send = interaction.getState().command;
  const editable = token.canControl && !readOnly;
  return (
    <section aria-label={`Condições de ${token.name}`} className="flex flex-col gap-2">
      <h4 className="text-[13px] text-label">Condições</h4>
      {token.conditions.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma</p>}
      <ul className="flex flex-col gap-1">
        {token.conditions.map((condition) => (
          <li key={condition.id} className="flex items-center gap-2 text-sm">
            <ConditionMark tone={condition.tone} />
            <span className="flex-1">{conditionLabel(condition)}</span>
            {token.canControl && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remover ${condition.name}`}
                disabled={readOnly}
                onClick={() => void send((c, id) => c.removeCondition(id, token.id, condition.id))}
              >
                <XIcon aria-hidden="true" />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {token.canControl && (
        <ConditionPicker
          board={board}
          interaction={interaction}
          isMaster={isMaster}
          disabled={!editable}
          label="Adicionar condição"
          onApply={(conditionId, rounds) =>
            send((c, id) => c.applyCondition(id, token.id, conditionId, rounds))
          }
        />
      )}
    </section>
  );
}
