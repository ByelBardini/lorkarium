import type { ConditionToneDto, TokenDto } from '@lorkarium/contracts';
import { XIcon } from 'lucide-react';
import { useId, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { ChoiceField, type ChoiceOption } from '@/components/choice-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { ConditionMark } from './condition-marks';
import { conditionLabel } from './combat-view';

export type ConditionsEditorProps = Readonly<{
  token: TokenDto;
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
}>;

const TONES: readonly ChoiceOption<ConditionToneDto>[] = [
  { value: 'benefit', label: 'Benéfica' },
  { value: 'harm', label: 'Prejudicial' },
];

/** "Condições" of a token: the active ones in text with their mark and rounds; for the master and
 *  the controllers, "Adicionar condição" (0 rounds = no limit) and "Remover"; for the master,
 *  "Nova condição…" too.
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
        <ApplyCondition
          token={token}
          board={board}
          interaction={interaction}
          disabled={!editable}
        />
      )}
      {isMaster && (
        <NewCondition token={token} board={board} interaction={interaction} disabled={readOnly} />
      )}
    </section>
  );
}

type ApplyProps = Readonly<{
  token: TokenDto;
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  disabled: boolean;
}>;

function ApplyCondition({ token, board, interaction, disabled }: ApplyProps): React.JSX.Element {
  const definitions = useBoard(board, (state) => state.board?.conditionDefinitions);
  const [conditionId, setConditionId] = useState('');
  const [rounds, setRounds] = useState('0');
  const ids = { select: useId(), rounds: useId() };
  const apply = (): void => {
    const count = Number(rounds) || 0;
    void interaction
      .getState()
      .command((c, id) => c.applyCondition(id, token.id, conditionId, count));
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor={ids.select} className="text-[13px] text-label">
          Adicionar condição
        </Label>
        <select
          id={ids.select}
          value={conditionId}
          disabled={disabled}
          onChange={(event) => setConditionId(event.target.value)}
          className="h-9 border border-input bg-card px-2 text-sm"
        >
          <option value="">Escolha…</option>
          {(definitions ?? []).map((definition) => (
            <option key={definition.id} value={definition.id}>
              {definition.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={ids.rounds} className="text-[13px] text-label">
          Rodadas
        </Label>
        <Input
          id={ids.rounds}
          value={rounds}
          inputMode="numeric"
          disabled={disabled}
          onChange={(event) => setRounds(event.target.value)}
          className="h-9 w-16 text-sm"
        />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || !conditionId}
        onClick={apply}
      >
        Aplicar
      </Button>
      <p className="w-full text-[13px] text-muted-foreground">0 rodadas = sem limite.</p>
    </div>
  );
}

function NewCondition({ token, board, interaction, disabled }: ApplyProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [tone, setTone] = useState<ConditionToneDto>('harm');
  const nameId = useId();
  const create = async (): Promise<void> => {
    const send = interaction.getState().command;
    if (!(await send((c, id) => c.defineCondition(id, name.trim(), tone)))) return;
    // The condition:defined event arrives before the ack: the new one is already on the list.
    const wanted = name.trim().toLowerCase();
    const found = board
      .getState()
      .board?.conditionDefinitions.find((d) => d.name.toLowerCase() === wanted);
    if (found) await send((c, id) => c.applyCondition(id, token.id, found.id, 0));
    setOpen(false);
    setName('');
  };
  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Nova condição…
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 border-t border-divider pt-2">
      <Label htmlFor={nameId} className="text-[13px] text-label">
        Nome da condição
      </Label>
      <Input
        id={nameId}
        value={name}
        maxLength={32}
        onChange={(event) => setName(event.target.value)}
        className="h-9 text-sm"
      />
      <ChoiceField legend="Natureza" value={tone} options={TONES} onChange={setTone} />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled || !name.trim()}
          onClick={() => void create()}
        >
          Criar e aplicar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
