import type { ActiveConditionDto, TokenDto } from '@lorkarium/contracts';
import { XIcon } from 'lucide-react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import { ConditionMark } from './condition-marks';
import { ConditionPicker } from './condition-picker';

export type ConditionsEditorProps = Readonly<{
  token: TokenDto;
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
}>;

/** "Condições" of a token: the active ones as a ruled list (mark, name, rounds or "∞"); for the
 *  master and the controllers, "Adicionar condição" (a typed name; empty rounds = no limit) and a
 *  "Remover" that shows on hover; a name not on the list is created by the master on the way.
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
      <ul className="flex flex-col">
        {token.conditions.map((condition) => (
          <ActiveConditionRow
            key={condition.id}
            condition={condition}
            removable={token.canControl}
            disabled={readOnly}
            onRemove={() => void send((c, id) => c.removeCondition(id, token.id, condition.id))}
          />
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

type ActiveConditionRowProps = Readonly<{
  condition: ActiveConditionDto;
  removable: boolean;
  disabled: boolean;
  onRemove: () => void;
}>;

// The remove button only shows on hover or focus; on touch screens (no hover) it always shows.
function ActiveConditionRow({ condition, removable, disabled, onRemove }: ActiveConditionRowProps) {
  return (
    <li className="group flex h-8 items-center gap-2 border-b border-divider text-sm last:border-b-0">
      <ConditionMark icon={condition.icon} tone={condition.tone} />
      <span className="min-w-0 flex-1 truncate text-foreground">{condition.name}</span>
      <RoundsLeft rounds={condition.remainingRounds} />
      {removable && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Remover ${condition.name}`}
          disabled={disabled}
          onClick={onRemove}
          className="text-muted-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <XIcon aria-hidden="true" />
        </Button>
      )}
    </li>
  );
}

/** "2 rod." or "∞" (read as "sem limite"). */
export function RoundsLeft({ rounds }: Readonly<{ rounds: number | null }>): React.JSX.Element {
  const className = 'shrink-0 text-xs text-muted-foreground tabular-nums';
  if (rounds !== null) return <span className={className}>{`${rounds} rod.`}</span>;
  return (
    <span className={className}>
      <span aria-hidden="true">∞</span>
      <span className="sr-only">sem limite</span>
    </span>
  );
}
