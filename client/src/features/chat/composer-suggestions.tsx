import { cn } from '@/lib/utils';
import { optionIdOf, type ComposerSuggestionsState } from './use-composer-suggestions';

/** The open list over the field: each suggestion with what it is; a click takes it (the field
 *  keeps the focus).
 *
 *  Example: `{suggestions.open && <ComposerSuggestions suggestions={suggestions} />}` */
export function ComposerSuggestions({
  suggestions,
}: Readonly<{ suggestions: ComposerSuggestionsState }>): React.JSX.Element {
  return (
    <ul
      id={suggestions.listId}
      role="listbox"
      aria-label="Sugestões"
      className="absolute inset-x-0 bottom-full mb-1 max-h-56 overflow-y-auto rounded-md border border-border bg-popover p-1"
    >
      {suggestions.options.map((option, index) => (
        <li
          key={option.value}
          id={optionIdOf(suggestions.listId, index)}
          role="option"
          aria-selected={index === suggestions.active}
          data-value={option.value}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => suggestions.accept(index)}
          className={cn(
            'flex cursor-pointer items-baseline gap-2 rounded-sm px-2 py-1.5 text-sm',
            index === suggestions.active ? 'bg-accent text-foreground' : 'text-label',
          )}
        >
          <span className="font-mono text-[13px]">{option.value}</span>
          <span className="truncate text-xs text-muted-foreground">{option.description}</span>
        </li>
      ))}
    </ul>
  );
}
