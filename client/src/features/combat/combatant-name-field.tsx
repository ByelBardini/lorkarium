import { COMBATANT_NAME_MAX_LENGTH } from '@lorkarium/contracts';
import { Input } from '@/components/ui/input';

export type CombatantNameFieldProps = Readonly<{
  /** The entry as it reads now ("Inimigos", "Goblin e mais 1"): the label and the start text. */
  label: string;
  disabled: boolean;
  onCommit: (name: string) => void;
  onClose: () => void;
}>;

/** "Nome de Inimigos": Enter sends the trimmed name (an empty one is not sent), Esc closes. Key it
 *  by the confirmed name, so a rename confirmed by someone else resets the text.
 *
 *  Example: `<CombatantNameField key={entry.name} label="Inimigos" disabled={false} onCommit={rename} onClose={close} />` */
export function CombatantNameField(props: CombatantNameFieldProps): React.JSX.Element {
  const { label, disabled, onCommit, onClose } = props;
  return (
    <Input
      aria-label={`Nome de ${label}`}
      defaultValue={label}
      maxLength={COMBATANT_NAME_MAX_LENGTH}
      disabled={disabled}
      autoFocus
      onKeyDown={(event) => {
        if (event.key === 'Escape') return onClose();
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const name = event.currentTarget.value.trim();
        if (name === '') return;
        onCommit(name);
        onClose();
      }}
      className="h-8 min-w-0 flex-1 text-sm"
    />
  );
}
