import type { ConditionDefinitionDto } from '@lorkarium/contracts';
import { CONDITION_TONE_GROUPS } from '@/lib/condition-names';
import { cn } from '@/lib/utils';
import { ConditionMark } from './condition-marks';

export type ConditionSuggestionListProps = Readonly<{
  id: string;
  /** Already `orderedByTone`. */
  suggestions: readonly ConditionDefinitionDto[];
  /** Index into suggestions. */
  active: number;
  onTake: (name: string) => void;
  /** An always-open list (the condition tool's panel) takes the focus itself and reads the arrow
   *  keys; the picker's list leaves both to its combobox field. */
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}>;

/** The listbox of a condition name: one group per nature (benefits, incapacitating,
 *  harms), each option with its description on one line and, on a stacking one, "até ×N"; as tall as the room
 *  the popover found (up to 15rem).
 *
 *  Example: `<ConditionSuggestionList id={id} suggestions={s} active={0} onTake={take} />` */
export function ConditionSuggestionList(props: ConditionSuggestionListProps): React.JSX.Element {
  const { id, suggestions, active } = props;
  return (
    <div
      id={id}
      role="listbox"
      aria-label="Condições da mesa"
      tabIndex={props.onKeyDown ? 0 : undefined}
      aria-activedescendant={props.onKeyDown && active >= 0 ? `${id}-${active}` : undefined}
      onKeyDown={props.onKeyDown}
      className="max-h-[min(15rem,var(--radix-popover-content-available-height))] [scrollbar-width:thin] [scrollbar-color:var(--color-input)_transparent] overflow-y-auto py-1"
    >
      {CONDITION_TONE_GROUPS.map(({ tone, title }) => {
        const members = suggestions.filter((item) => item.tone === tone);
        if (members.length === 0) return null;
        return (
          <div key={tone} role="group" aria-label={title}>
            <div className="px-2.5 pt-2 pb-1 text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
              {title}
            </div>
            {members.map((definition) => (
              <SuggestionOption
                key={definition.id}
                id={`${id}-${suggestions.indexOf(definition)}`}
                definition={definition}
                active={suggestions.indexOf(definition) === active}
                onPick={() => props.onTake(definition.name)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

type SuggestionOptionProps = Readonly<{
  id: string;
  definition: ConditionDefinitionDto;
  active: boolean;
  onPick: () => void;
}>;

// Named by the name alone and described by its description, shown in one line: enough to tell
// two conditions apart while choosing.
function SuggestionOption({ id, definition, active, onPick }: SuggestionOptionProps) {
  const described = definition.description !== '';
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      aria-label={definition.name}
      aria-describedby={described ? `${id}-description` : undefined}
      // Before the blur: the click must still find the list open.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
      className={cn(
        'flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm text-foreground hover:bg-accent',
        active && 'bg-accent',
      )}
    >
      <ConditionMark
        icon={definition.icon}
        tone={definition.tone}
        color={definition.color}
        imageAssetId={definition.imageAssetId}
      />
      <SuggestionText definition={definition} descriptionId={`${id}-description`} />
      <MaxStacksText maxStacks={definition.maxStacks} />
    </div>
  );
}

// The option is named by the name alone, so this stays a visual aid.
function MaxStacksText({ maxStacks }: Readonly<{ maxStacks: number | null }>) {
  if (maxStacks === null) return null;
  return (
    <span
      aria-hidden="true"
      className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums"
    >
      {`até ×${maxStacks}`}
    </span>
  );
}

function SuggestionText({
  definition,
  descriptionId,
}: Readonly<{ definition: ConditionDefinitionDto; descriptionId: string }>) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate">{definition.name}</span>
      {definition.description !== '' && (
        <span id={descriptionId} className="truncate text-xs text-muted-foreground">
          {definition.description}
        </span>
      )}
    </span>
  );
}
