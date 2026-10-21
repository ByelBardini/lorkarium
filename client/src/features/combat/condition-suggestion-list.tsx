import type { ConditionDefinitionDto, ConditionToneDto } from '@lorkarium/contracts';
import { cn } from '@/lib/utils';
import { ConditionMark } from './condition-marks';

const GROUPS: readonly Readonly<{ tone: ConditionToneDto; title: string }>[] = [
  { tone: 'benefit', title: 'Benéficas' },
  { tone: 'harm', title: 'Prejudiciais' },
];

export type ConditionSuggestionListProps = Readonly<{
  id: string;
  /** Already `orderedByTone`. */
  suggestions: readonly ConditionDefinitionDto[];
  /** Index into suggestions. */
  active: number;
  onTake: (name: string) => void;
}>;

/** The listbox of a condition name: one group per nature, benefits first; as tall as the room
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
      className="max-h-[min(15rem,var(--radix-popover-content-available-height))] [scrollbar-width:thin] [scrollbar-color:var(--color-input)_transparent] overflow-y-auto py-1"
    >
      {GROUPS.map(({ tone, title }) => {
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
                active={suggestions.indexOf(definition) === active}
                onPick={() => props.onTake(definition.name)}
              >
                <ConditionMark icon={definition.icon} tone={definition.tone} />
                <span className="truncate">{definition.name}</span>
              </SuggestionOption>
            ))}
          </div>
        );
      })}
    </div>
  );
}

type SuggestionOptionProps = Readonly<{
  id: string;
  active: boolean;
  onPick: () => void;
  className?: string;
  children: React.ReactNode;
}>;

function SuggestionOption({ id, active, onPick, className, children }: SuggestionOptionProps) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      // Before the blur: the click must still find the list open.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
      className={cn(
        'flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm text-foreground hover:bg-accent',
        active && 'bg-accent',
        className,
      )}
    >
      {children}
    </div>
  );
}
