import { SAVED_ROLL_NAME_MAX_LENGTH, type DiceRollPartDto } from '@lorkarium/contracts';
import { XIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { savedRollFailureMessage } from './dice-messages';
import type { SavedRollsView } from './use-saved-rolls';

export type SaveRollFormProps = Readonly<{
  /** The tray's parts without advantage: advantage is chosen when rolling. */
  parts: readonly DiceRollPartDto[];
  saved: SavedRollsView;
  onDone: () => void;
}>;

/** The line the bookmark opens: names the tray's formula and keeps it as a new saved roll (a
 *  copy of the parts). Enter saves, Esc or "×" closes; the server's refusal (name taken, 50
 *  saved) stays under the field.
 *
 *  Example: `<SaveRollForm parts={parts} saved={saved} onDone={close} />` */
export function SaveRollForm({ parts, saved, onDone }: SaveRollFormProps): React.JSX.Element {
  const id = useId();
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await saved.create({ name: name.trim(), parts: [...parts] });
    setBusy(false);
    if (result.ok) return onDone();
    setProblem(savedRollFailureMessage(result.failure));
  };
  return (
    <form
      onSubmit={(event) => void submit(event)}
      aria-busy={busy}
      className="flex flex-col gap-1.5 rounded-md border border-input bg-card p-2.5"
    >
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          aria-label="Nome da rolagem"
          placeholder="Nome, ex.: Ataque com espada"
          value={name}
          maxLength={SAVED_ROLL_NAME_MAX_LENGTH}
          aria-invalid={problem !== null}
          aria-describedby={problem === null ? undefined : `${id}-error`}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === 'Escape' && onDone()}
          className="h-9 text-sm"
        />
        <Button type="submit" size="lg" disabled={busy || name.trim() === ''}>
          Salvar
        </Button>
        <Button type="button" variant="ghost" size="icon-lg" aria-label="Cancelar" onClick={onDone}>
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      {problem !== null && (
        <p id={`${id}-error`} className="text-xs text-destructive-text">
          {problem}
        </p>
      )}
    </form>
  );
}
