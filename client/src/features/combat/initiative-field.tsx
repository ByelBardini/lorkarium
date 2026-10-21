import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { parseInitiative } from '@/lib/initiative-text';
import { cn } from '@/lib/utils';
import { signedText } from './combat-view';

export type InitiativeFieldProps = Readonly<{
  name: string;
  value: number | null;
  current: boolean;
  disabled: boolean;
  /** `null` clears the initiative; answers whether the server confirmed it. */
  onCommit: (value: number | null) => Promise<boolean>;
}>;

/** "Iniciativa de Kael": a whole number (−999…999) or empty, sent on Enter or when the field
 *  loses the focus; a refusal puts the confirmed value back. Key it by the confirmed value, so a
 *  change confirmed by someone else resets the text.
 *
 *  Example: `<InitiativeField name="Kael" value={18} current disabled={false} onCommit={send} />` */
export function InitiativeField(props: InitiativeFieldProps): React.JSX.Element {
  const { name, value, current, disabled, onCommit } = props;
  const id = useId();
  const [text, setText] = useState(shown(value));
  const commit = async (): Promise<void> => {
    const parsed = parseInitiative(text);
    if (parsed === 'invalid' || parsed === value) return setText(shown(value));
    if (!(await onCommit(parsed))) setText(shown(value));
  };
  return (
    <Input
      id={id}
      aria-label={`Iniciativa de ${name}`}
      value={text}
      inputMode="numeric"
      disabled={disabled}
      placeholder="—"
      onChange={(event) => setText(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        void commit();
      }}
      className={cn(
        'h-9 w-14 px-2 text-center text-sm tabular-nums',
        current && 'border-primary text-primary',
      )}
    />
  );
}

function shown(value: number | null): string {
  return value === null ? '' : signedText(value);
}
