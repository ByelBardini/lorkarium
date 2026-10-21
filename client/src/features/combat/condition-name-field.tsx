import type { ConditionDefinitionDto } from '@lorkarium/contracts';
import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { conditionSuggestions, orderedByTone } from '@/lib/condition-names';
import { ConditionSuggestionList } from './condition-suggestion-list';

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
 *  Enter or a click takes one, Esc closes them. Any name may be typed. The list floats in a
 *  portal under the field, or above it when there is no room below (the token's detail sits at
 *  the foot of the panel and scrolls on its own: a list inside it would be cut).
 *
 *  Example: `<ConditionNameField id={id} value={name} definitions={definitions} disabled={false} onChange={setName} onSubmit={apply} />` */
export function ConditionNameField(props: ConditionNameFieldProps): React.JSX.Element {
  const { id, value, definitions, disabled, onChange, onSubmit } = props;
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const suggestions = orderedByTone(conditionSuggestions(definitions, value));
  const total = suggestions.length;
  const shown = open && total > 0;
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
      setActive((current) => wrapIndex(current, step, total));
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
    <Popover open={shown} onOpenChange={(next) => !next && setOpen(false)}>
      <PopoverAnchor asChild>
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
          className="h-9 w-full min-w-0 flex-1 text-sm"
        />
      </PopoverAnchor>
      <PopoverContent
        role="presentation"
        side="bottom"
        align="start"
        collisionPadding={8}
        // The focus stays in the field: typing goes on while the list is open.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (event.target instanceof Node && event.target === inputOf(listId))
            event.preventDefault();
        }}
        className="w-(--radix-popover-trigger-width) gap-0 border-input bg-card p-0"
      >
        <ConditionSuggestionList
          id={listId}
          suggestions={suggestions}
          active={active}
          onTake={take}
        />
      </PopoverContent>
    </Popover>
  );
}

function inputOf(listId: string): Element | null {
  return document.querySelector(`[aria-controls="${CSS.escape(listId)}"]`);
}

// From nothing highlighted, ↓ goes to the first and ↑ to the last.
function wrapIndex(current: number, step: number, length: number): number {
  if (length === 0) return -1;
  const from = current < 0 && step < 0 ? 0 : current;
  return (from + step + length) % length;
}
