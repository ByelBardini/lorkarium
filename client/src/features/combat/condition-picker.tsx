import type {
  ConditionDefinitionDto,
  ConditionIconDto,
  ConditionLookDto,
  ConditionToneDto,
} from '@lorkarium/contracts';
import { useId, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { findConditionByName } from '@/lib/condition-names';
import { digitsOnly } from '@/lib/numeric-text';
import type { NewConditionDefinition } from '@/services/table-board-commands';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { ConditionIconField } from './condition-icon-field';
import { ConditionLookField } from './condition-look-field';
import { ConditionNameField } from './condition-name-field';
import { ConditionToneField } from './condition-tone-field';

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

const NO_DEFINITIONS: readonly ConditionDefinitionDto[] = [];

/** A typed condition name (the table's list as suggestions) + "Rodadas" (empty or 0 = no limit,
 *  "∞") + "Aplicar". A name not on the list is created first, by the master only, with its icon
 *  and nature in one compact row and its look on the token below.
 *
 *  Example: `<ConditionPicker board={board} interaction={interaction} isMaster disabled={false} label="Adicionar condição" onApply={apply} />` */
export function ConditionPicker(props: ConditionPickerProps): React.JSX.Element {
  const definitions = useBoard(
    props.board,
    (state) => state.board?.conditionDefinitions ?? NO_DEFINITIONS,
  );
  const [name, setName] = useState('');
  const [rounds, setRounds] = useState('');
  const [tone, setTone] = useState<ConditionToneDto>('harm');
  const [icon, setIcon] = useState<ConditionIconDto>('circle-dot');
  const [look, setLook] = useState<ConditionLookDto | null>(null);
  const ids = { name: useId(), rounds: useId() };
  const known = findConditionByName(definitions, name);
  const isNew = name.trim() !== '' && !known;
  const blocked = props.disabled || name.trim() === '' || (isNew && !props.isMaster);
  const submit = async (): Promise<void> => {
    if (blocked) return;
    const definition = { name: name.trim(), tone, icon, look };
    const conditionId = known?.id ?? (await defineNamed(props, definition));
    if (conditionId && (await props.onApply(conditionId, Number(rounds) || 0))) setName('');
  };
  const creating = isNew && props.isMaster;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Label htmlFor={ids.name} className="min-w-0 flex-1 text-[13px] text-label">
          {props.label}
        </Label>
        <Label htmlFor={ids.rounds} className="w-12 text-[13px] text-label">
          Rodadas
        </Label>
        <span aria-hidden="true" className="w-9" />
      </div>
      <div className="flex gap-2">
        <ConditionNameField
          id={ids.name}
          value={name}
          definitions={definitions}
          disabled={props.disabled}
          onChange={setName}
          onSubmit={() => void submit()}
        />
        <Input
          id={ids.rounds}
          value={rounds}
          inputMode="numeric"
          maxLength={2}
          placeholder="∞"
          disabled={props.disabled}
          onChange={(event) => setRounds(digitsOnly(event.target.value))}
          className="h-9 w-12 text-center text-sm tabular-nums"
        />
        <Button
          type="button"
          variant={creating ? 'default' : 'outline'}
          size="icon"
          aria-label={creating ? 'Criar e aplicar' : 'Aplicar'}
          title={creating ? 'Criar e aplicar' : 'Aplicar'}
          disabled={blocked}
          onClick={() => void submit()}
          className="size-9 shrink-0"
        >
          <PlusIcon aria-hidden="true" />
        </Button>
      </div>
      {creating && (
        <div className="flex gap-2">
          <ConditionIconField value={icon} tone={tone} onChange={setIcon} />
          <ConditionToneField value={tone} onChange={setTone} />
        </div>
      )}
      {creating && <ConditionLookField value={look} onChange={setLook} />}
      {isNew && !props.isMaster && (
        <p className="text-[13px] text-muted-foreground">Só o mestre cria condição nova.</p>
      )}
    </div>
  );
}

async function defineNamed(
  props: ConditionPickerProps,
  definition: NewConditionDefinition,
): Promise<string | undefined> {
  const send = props.interaction.getState().command;
  if (!(await send((c, id) => c.defineCondition(id, definition)))) return undefined;
  // The condition:defined event arrives before the ack: the new one is already on the list.
  const definitions = props.board.getState().board?.conditionDefinitions ?? NO_DEFINITIONS;
  return findConditionByName(definitions, definition.name)?.id;
}
