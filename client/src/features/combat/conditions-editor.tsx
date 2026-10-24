import type { ActiveConditionDto, TokenDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import { ConditionPicker } from './condition-picker';
import { ConditionTags, EditableConditionTag } from './condition-tag';

export type ConditionsEditorProps = Readonly<{
  token: TokenDto;
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
}>;

/** "Condições" of the selected token: for whoever acts on the table (master or player, on any
 *  token: a condition is a marker the table corrects by itself), each active one with −/+ (the
 *  stacks of a stacking one, by `condition:setStacks`), −/+ (the rounds left, by
 *  `condition:setRounds`) and ×, and "Adicionar condição" (a typed name; empty
 *  rounds = no limit); read-only (a spectator, or reconnecting), the tags only. A refusal keeps
 *  the confirmed value.
 *
 *  Example: `<ConditionsEditor token={token} board={board} interaction={interaction} isMaster />` */
export function ConditionsEditor({ token, board, interaction, isMaster }: ConditionsEditorProps) {
  const readOnly = useBoardInteraction(interaction, (state) => state.readOnly);
  const send = interaction.getState().command;
  return (
    <section aria-label={`Condições de ${token.name}`} className="flex flex-col gap-2">
      <h4 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        Condições
      </h4>
      {token.conditions.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma</p>}
      {readOnly ? (
        <ConditionTags owner={token.name} conditions={token.conditions} />
      ) : (
        <EditableTags token={token} interaction={interaction} />
      )}
      {!readOnly && (
        <ConditionPicker
          board={board}
          interaction={interaction}
          isMaster={isMaster}
          disabled={false}
          label="Adicionar condição"
          onApply={(conditionId, rounds) =>
            send((c, id) => c.applyCondition(id, token.id, conditionId, rounds))
          }
        />
      )}
    </section>
  );
}

type EditableTagsProps = Readonly<{
  token: TokenDto;
  interaction: StoreApi<BoardInteractionStore>;
}>;

function EditableTags({ token, interaction }: EditableTagsProps) {
  const send = interaction.getState().command;
  const setRounds = (condition: ActiveConditionDto, rounds: number): void =>
    void send((c, id) => c.setConditionRounds(id, token.id, condition.id, rounds));
  const setStacks = (condition: ActiveConditionDto, stacks: number): void =>
    void send((c, id) => c.setConditionStacks(id, token.id, condition.id, stacks));
  if (token.conditions.length === 0) return null;
  return (
    <ul aria-label={`Condições ativas de ${token.name}`} className="flex flex-wrap gap-1">
      {token.conditions.map((condition) => (
        <EditableConditionTag
          key={condition.id}
          condition={condition}
          disabled={false}
          onRounds={(rounds) => setRounds(condition, rounds)}
          onStacks={(stacks) => setStacks(condition, stacks)}
          onRemove={() => void send((c, id) => c.removeCondition(id, token.id, condition.id))}
        />
      ))}
    </ul>
  );
}
