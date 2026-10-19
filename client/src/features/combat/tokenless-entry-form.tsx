import { COMBATANT_NAME_MAX_LENGTH } from '@lorkarium/contracts';
import { PlusIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type TokenlessEntryFormProps = Readonly<{
  disabled: boolean;
  onCreate: (name: string) => void;
}>;

/** "+ Entrada sem token" (master): a turn that is no token, like the "Covil" or a trap; it needs a
 *  name, and "Criar entrada" stays off until it has one.
 *
 *  Example: `<TokenlessEntryForm disabled={readOnly} onCreate={(name) => add([{ name, tokenIds: [] }])} />` */
export function TokenlessEntryForm({ disabled, onCreate }: TokenlessEntryFormProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
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
        <PlusIcon aria-hidden="true" />
        Entrada sem token
      </Button>
    );
  }
  const trimmed = name.trim();
  const create = (): void => {
    if (trimmed === '') return;
    onCreate(trimmed);
    setName('');
    setOpen(false);
  };
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        create();
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Label htmlFor={id} className="text-[13px] text-label">
          Nome da entrada
        </Label>
        <Input
          id={id}
          value={name}
          maxLength={COMBATANT_NAME_MAX_LENGTH}
          autoFocus
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}
          placeholder="Covil"
        />
      </div>
      <Button type="submit" size="sm" disabled={disabled || trimmed === ''}>
        Criar entrada
      </Button>
    </form>
  );
}
