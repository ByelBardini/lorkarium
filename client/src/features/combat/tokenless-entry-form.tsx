import { COMBATANT_NAME_MAX_LENGTH } from '@lorkarium/contracts';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseInitiative } from '@/lib/initiative-text';

export type TokenlessEntry = Readonly<{ name: string; initiative: number | null }>;

export type TokenlessEntryFormProps = Readonly<{
  disabled: boolean;
  /** Answers whether the server confirmed it; a refusal keeps what was typed. */
  onCreate: (entry: TokenlessEntry) => Promise<boolean>;
  onCancel: () => void;
}>;

/** "Entrada sem token" (master): a turn that is no token, like the "Covil" or a trap. It needs a
 *  name; the initiative is optional (blank enters at the end of the order).
 *
 *  Example: `<TokenlessEntryForm disabled={readOnly} onCreate={add} onCancel={close} />` */
export function TokenlessEntryForm({ disabled, onCreate, onCancel }: TokenlessEntryFormProps) {
  const id = useId();
  const [name, setName] = useState('');
  const [initiative, setInitiative] = useState('');
  const trimmed = name.trim();
  const parsed = parseInitiative(initiative);
  const create = async (): Promise<void> => {
    if (trimmed === '' || parsed === 'invalid') return;
    if (await onCreate({ name: trimmed, initiative: parsed })) onCancel();
  };
  return (
    <form
      aria-label="Entrada sem token"
      className="flex flex-col gap-2 border-y border-border py-3"
      onSubmit={(event) => {
        event.preventDefault();
        void create();
      }}
      onKeyDown={(event) => event.key === 'Escape' && onCancel()}
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Label htmlFor={`${id}-name`} className="text-[13px] text-label">
            Nome da entrada
          </Label>
          <Input
            id={`${id}-name`}
            value={name}
            maxLength={COMBATANT_NAME_MAX_LENGTH}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            placeholder="Covil"
            className="h-10"
          />
        </div>
        <div className="flex w-20 flex-col gap-1">
          <Label htmlFor={`${id}-initiative`} className="text-[13px] text-label">
            Iniciativa
          </Label>
          <Input
            id={`${id}-initiative`}
            value={initiative}
            inputMode="numeric"
            placeholder="—"
            aria-invalid={parsed === 'invalid' || undefined}
            aria-describedby={parsed === 'invalid' ? `${id}-error` : undefined}
            onChange={(event) => setInitiative(event.target.value)}
            className="h-10 text-center tabular-nums"
          />
        </div>
      </div>
      {parsed === 'invalid' && (
        <p id={`${id}-error`} className="text-xs text-destructive-text">
          Iniciativa de −999 a 999, ou em branco.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={disabled || trimmed === '' || parsed === 'invalid'}
        >
          Criar entrada
        </Button>
      </div>
    </form>
  );
}
