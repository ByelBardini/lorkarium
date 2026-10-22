import type { ConditionIconDto, ConditionToneDto } from '@lorkarium/contracts';
import { CONDITION_ICON_ENTRIES } from '@/lib/condition-icons';
import { cn } from '@/lib/utils';

/** The icon of a condition, gold for a benefit and the error color for a harm or an
 *  incapacitating one. Never alone: the name always goes with it.
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
