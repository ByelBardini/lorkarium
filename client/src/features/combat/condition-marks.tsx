import type { ActiveConditionDto, ConditionIconDto, ConditionToneDto } from '@lorkarium/contracts';
import { CONDITION_ICON_ENTRIES } from '@/lib/condition-icons';
import { cn } from '@/lib/utils';

/** The icon of a condition, gold for a benefit and the error color for a harm. Never alone: the
 *  name always goes with it.
 *
 *  Example: `<ConditionMark icon={condition.icon} tone={condition.tone} />` */
export function ConditionMark({
  icon,
  tone,
}: Readonly<{ icon: ConditionIconDto; tone: ConditionToneDto }>): React.JSX.Element {
  const Glyph = CONDITION_ICON_ENTRIES[icon].glyph;
  return (
    <Glyph
      aria-hidden="true"
      data-icon={icon}
      className={cn('size-4 shrink-0', tone === 'benefit' ? 'text-primary' : 'text-destructive')}
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
        <ConditionMark key={condition.id} icon={condition.icon} tone={condition.tone} />
      ))}
      <span className="truncate">{conditions.map(({ name }) => name).join(', ')}</span>
    </span>
  );
}
