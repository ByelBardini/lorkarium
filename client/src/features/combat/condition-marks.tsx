import type { ActiveConditionDto, ConditionToneDto } from '@lorkarium/contracts';
import { cn } from '@/lib/utils';

/** The 8px square of a condition: gold for a benefit, the error color for a harm. Never alone:
 *  the name always goes with it. */
export function ConditionMark({ tone }: Readonly<{ tone: ConditionToneDto }>): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block size-2 shrink-0',
        tone === 'benefit' ? 'bg-primary' : 'bg-destructive',
      )}
    />
  );
}

/** The conditions of a token in one truncated line of text, with the total for screen readers.
 *
 *  Example: `<ConditionSummary conditions={token.conditions} />` */
export function ConditionSummary({
  conditions,
}: Readonly<{ conditions: readonly ActiveConditionDto[] }>): React.JSX.Element | null {
  if (conditions.length === 0) return null;
  const total = conditions.length === 1 ? '1 condição' : `${conditions.length} condições`;
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <span className="sr-only">{`${total}: `}</span>
      {conditions.slice(0, 1).map((condition) => (
        <ConditionMark key={condition.id} tone={condition.tone} />
      ))}
      <span className="truncate">{conditions.map(({ name }) => name).join(', ')}</span>
    </span>
  );
}
