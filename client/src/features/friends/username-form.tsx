import { typedUsernameDto } from '@lorkarium/contracts';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type UsernameFormProps = Readonly<{
  label: string;
  submitLabel: string;
  hint?: string;
  /** Runs with the @ already clean (no "@", lower case); answers the refusal, or `null`. */
  onSubmit: (username: string) => Promise<string | null>;
}>;

const INVALID_TEXT = 'Esse @ não é válido.';

/** A field for an exact @ and its button: "Adicionar pelo @usuário", "Bloquear pelo @". A @ that
 *  is not one never leaves; a refusal stays under the field (`role="alert"`) and keeps the text.
 *
 *  Example: `<UsernameForm label="Adicionar pelo @usuário" submitLabel="Enviar" onSubmit={send} />` */
export function UsernameForm({
  label,
  submitLabel,
  hint,
  onSubmit,
}: UsernameFormProps): React.JSX.Element {
  const id = useId();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const parsed = typedUsernameDto.safeParse(typed);
    if (!parsed.success) return setError(INVALID_TEXT);
    setBusy(true);
    const refusal = await onSubmit(parsed.data);
    setBusy(false);
    setError(refusal);
    if (refusal === null) setTyped('');
  };
  return (
    <form className="flex flex-col gap-2" onSubmit={(event) => void submit(event)} noValidate>
      <label htmlFor={id} className="text-sm text-label">
        {label}
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={typed}
          placeholder="@usuário"
          autoComplete="off"
          aria-invalid={error !== null}
          onChange={(event) => setTyped(event.target.value)}
          className="h-10"
        />
        <Button type="submit" size="lg" disabled={busy || typed.trim() === ''}>
          {submitLabel}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive-text">
          {error}
        </p>
      )}
      {!error && hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </form>
  );
}
