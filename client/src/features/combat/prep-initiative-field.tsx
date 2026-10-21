import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { parseInitiative } from '@/lib/initiative-text';

export type PrepInitiativeFieldProps = Readonly<{
  /** Names the field: "Iniciativa de Kael". */
  name: string;
  text: string;
  onChange: (text: string) => void;
  disabled?: boolean;
}>;

/** The initiative typed while preparing: free text ("18", "−2" or empty), marked invalid with the
 *  reason tied to the field while it is not a whole number in −999…999.
 *
 *  Example: `<PrepInitiativeField name="Kael" text={text} onChange={setText} />` */
export function PrepInitiativeField({ name, text, onChange, disabled }: PrepInitiativeFieldProps) {
  const id = useId();
  const invalid = parseInitiative(text) === 'invalid';
  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <Input
        aria-label={`Iniciativa de ${name}`}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        value={text}
        inputMode="numeric"
        placeholder="—"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-12 px-1 text-center text-sm font-semibold tabular-nums"
      />
      {invalid && (
        <span id={`${id}-error`} className="text-[11px] text-destructive-text">
          De −999 a 999
        </span>
      )}
    </span>
  );
}
