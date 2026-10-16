import { useId } from 'react';
import { ChoiceField } from '@/components/choice-field';
import { FormField } from '@/components/form-field';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BarsEditor } from './bars-editor';
import { SIDE_OPTIONS, SIZE_OPTIONS } from './token-messages';
import { renameToken, type TokenFormErrors, type TokenFormValues } from './token-form-state';

/** Someone at the table who may control a token. */
export type TokenPlayer = Readonly<{ userId: string; name: string }>;

export type TokenFormProps = Readonly<{
  form: TokenFormValues;
  errors: TokenFormErrors;
  players: readonly TokenPlayer[];
  onChange: (form: TokenFormValues) => void;
}>;

/** The fields of a token: name and initials (filled from the name until edited), side, size,
 *  who controls it, and its bars.
 *
 *  Example: `<TokenForm form={form} errors={errors} players={players} onChange={setForm} />` */
export function TokenForm({ form, errors, players, onChange }: TokenFormProps): React.JSX.Element {
  const nameId = useId();
  const initialsId = useId();
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-[1fr_6rem] gap-4">
        <FormField id={nameId} label="Nome" error={errors.name}>
          <Input
            id={nameId}
            value={form.name}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? `${nameId}-error` : undefined}
            onChange={(event) => onChange(renameToken(form, event.target.value))}
          />
        </FormField>
        <FormField id={initialsId} label="Iniciais" error={errors.initials}>
          <Input
            id={initialsId}
            value={form.initials}
            maxLength={3}
            aria-invalid={errors.initials ? true : undefined}
            aria-describedby={errors.initials ? `${initialsId}-error` : undefined}
            onChange={(event) =>
              onChange({
                ...form,
                initials: event.target.value.toUpperCase(),
                initialsEdited: true,
              })
            }
          />
        </FormField>
      </div>
      <ChoiceField
        legend="Lado"
        value={form.side}
        options={SIDE_OPTIONS}
        onChange={(side) => onChange({ ...form, side })}
      />
      <ChoiceField
        legend="Tamanho"
        value={SIZE_OPTIONS.find(({ value }) => Number(value) === form.size)?.value ?? '1'}
        options={SIZE_OPTIONS}
        onChange={(size) => onChange({ ...form, size: Number(size) })}
      />
      <ControllersField form={form} players={players} onChange={onChange} />
      <BarsEditor form={form} errors={errors.bars} onChange={onChange} />
    </div>
  );
}

function ControllersField({
  form,
  players,
  onChange,
}: Pick<TokenFormProps, 'form' | 'players' | 'onChange'>): React.JSX.Element {
  const toggle = (userId: string, checked: boolean): void => {
    const others = form.controllerIds.filter((id) => id !== userId);
    onChange({ ...form, controllerIds: checked ? [...others, userId] : others });
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[13px] text-label">Quem controla</legend>
      {players.length === 0 && (
        <p className="text-[13px] text-muted-foreground">Nenhum jogador na mesa ainda.</p>
      )}
      {players.map((player) => (
        <PlayerCheck
          key={player.userId}
          player={player}
          checked={form.controllerIds.includes(player.userId)}
          onCheckedChange={(checked) => toggle(player.userId, checked)}
        />
      ))}
    </fieldset>
  );
}

type PlayerCheckProps = Readonly<{
  player: TokenPlayer;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}>;

function PlayerCheck({ player, checked, onCheckedChange }: PlayerCheckProps): React.JSX.Element {
  const id = useId();
  return (
    <div className="flex items-center gap-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <Label htmlFor={id} className="text-sm text-foreground">
        {player.name}
      </Label>
    </div>
  );
}
