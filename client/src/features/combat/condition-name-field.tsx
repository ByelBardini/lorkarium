import type { ConditionDefinitionDto } from '@lorkarium/contracts';
import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { conditionSuggestions } from '@/lib/condition-names';
import { cn } from '@/lib/utils';
import { ConditionMark } from './condition-marks';

const STEP: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };

export type ConditionNameFieldProps = Readonly<{
  id: string;
  value: string;
  definitions: readonly ConditionDefinitionDto[];
  disabled: boolean;
  onChange: (name: string) => void;
  /** Enter with no suggestion highlighted. */
  onSubmit: () => void;
}>;

/** A typed condition name with the table's list as suggestions (a combobox): ↑/↓ walk them,
 *  Enter or a click takes one, Esc closes them. Any name may be typed.
 *
 *  Example: `<ConditionNameField id={id} value={name} definitions={definitions} disabled={false} onChange={setName} onSubmit={apply} />` */
export function ConditionNameField(props: ConditionNameFieldProps): React.JSX.Element {
  const { id, value, definitions, disabled, onChange, onSubmit } = props;
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const suggestions = conditionSuggestions(definitions, value);
  const shown = open && suggestions.length > 0;
  const take = (name: string): void => {
    onChange(name);
    setOpen(false);
    setActive(-1);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    const step = STEP[event.key];
    if (step !== undefined) {
      event.preventDefault();
      setOpen(true);
      setActive((current) => wrapIndex(current, step, suggestions.length));
      return;
    }
    if (event.key === 'Escape' && shown) {
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const highlighted = shown ? suggestions[active] : undefined;
    if (highlighted) take(highlighted.name);
    else onSubmit();
  };
  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        value={value}
        maxLength={32}
        disabled={disabled}
        placeholder="Envenenado, Caído…"
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="h-9 w-44 text-sm"
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Condições da mesa"
        hidden={!shown}
        className="absolute top-full left-0 z-20 mt-1 max-h-56 w-44 overflow-y-auto border border-border bg-popover py-1 shadow-md"
      >
        {suggestions.map((definition, index) => (
          <li
            key={definition.id}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            // Before the blur: the click must still find the list open.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => take(definition.name)}
            className={cn(
              'flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm',
              index === active && 'bg-accent text-accent-foreground',
            )}
          >
            <ConditionMark tone={definition.tone} />
            {definition.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

// From nothing highlighted, ↓ goes to the first and ↑ to the last.
function wrapIndex(current: number, step: number, length: number): number {
  if (length === 0) return -1;
  const from = current < 0 && step < 0 ? 0 : current;
  return (from + step + length) % length;
}
