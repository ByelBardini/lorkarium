import type { ConditionDefinitionDto, ConditionToneDto } from '@lorkarium/contracts';
import { useId, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { ChoiceField, type ChoiceOption } from '@/components/choice-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { findConditionByName } from '@/lib/condition-names';
import { digitsOnly } from '@/lib/numeric-text';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { ConditionNameField } from './condition-name-field';

export type ConditionPickerProps = Readonly<{
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
  disabled: boolean;
  /** The name field's label, e.g. "Adicionar condição". */
  label: string;
  /** Sends the apply; `true` when confirmed, which empties the name. */
  onApply: (conditionId: string, rounds: number) => Promise<boolean>;
}>;

const TONES: readonly ChoiceOption<ConditionToneDto>[] = [
  { value: 'benefit', label: 'Benéfica' },
  { value: 'harm', label: 'Prejudicial' },
];

const NO_DEFINITIONS: readonly ConditionDefinitionDto[] = [];

/** A typed condition name (the table's list as suggestions) + "Rodadas" (0 = no limit) +
 *  "Aplicar". A name not on the list is created first, by the master only, with its nature.
 *
 *  Example: `<ConditionPicker board={board} interaction={interaction} isMaster disabled={false} label="Adicionar condição" onApply={apply} />` */
export function ConditionPicker(props: ConditionPickerProps): React.JSX.Element {
  const definitions = useBoard(
    props.board,
    (state) => state.board?.conditionDefinitions ?? NO_DEFINITIONS,
  );
  const [name, setName] = useState('');
  const [rounds, setRounds] = useState('0');
  const [tone, setTone] = useState<ConditionToneDto>('harm');
  const ids = { name: useId(), rounds: useId() };
  const known = findConditionByName(definitions, name);
  const isNew = name.trim() !== '' && !known;
  const blocked = props.disabled || name.trim() === '' || (isNew && !props.isMaster);
  const submit = async (): Promise<void> => {
    if (blocked) return;
    const conditionId = known?.id ?? (await defineNamed(props, name, tone));
    if (conditionId && (await props.onApply(conditionId, Number(rounds) || 0))) setName('');
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.name} className="text-[13px] text-label">
            {props.label}
          </Label>
          <ConditionNameField
            id={ids.name}
            value={name}
            definitions={definitions}
            disabled={props.disabled}
            onChange={setName}
            onSubmit={() => void submit()}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.rounds} className="text-[13px] text-label">
            Rodadas
          </Label>
          <Input
            id={ids.rounds}
            value={rounds}
            inputMode="numeric"
            maxLength={2}
            disabled={props.disabled}
            onChange={(event) => setRounds(digitsOnly(event.target.value))}
            className="h-9 w-14 text-sm"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={blocked}
          onClick={() => void submit()}
        >
          {isNew && props.isMaster ? 'Criar e aplicar' : 'Aplicar'}
        </Button>
      </div>
      {isNew && props.isMaster && (
        <ChoiceField legend="Natureza" value={tone} options={TONES} onChange={setTone} />
      )}
      <p className="text-[13px] text-muted-foreground">
        {isNew && !props.isMaster ? 'Só o mestre cria condição nova.' : '0 rodadas = sem limite.'}
      </p>
    </div>
  );
}

async function defineNamed(
  props: ConditionPickerProps,
  name: string,
  tone: ConditionToneDto,
): Promise<string | undefined> {
  const send = props.interaction.getState().command;
  if (!(await send((c, id) => c.defineCondition(id, name.trim(), tone)))) return undefined;
  // The condition:defined event arrives before the ack: the new one is already on the list.
  const definitions = props.board.getState().board?.conditionDefinitions ?? NO_DEFINITIONS;
  return findConditionByName(definitions, name)?.id;
}
