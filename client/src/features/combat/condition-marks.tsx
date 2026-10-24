import type { ConditionColorDto, ConditionIconDto, ConditionToneDto } from '@lorkarium/contracts';
import { CONDITION_COLOR_ENTRIES } from '@/lib/condition-colors';
import { CONDITION_ICON_ENTRIES } from '@/lib/condition-icons';
import { cn } from '@/lib/utils';

export type ConditionMarkProps = Readonly<{
  icon: ConditionIconDto;
  tone: ConditionToneDto;
  /** The master's color; absent or `null`: the tone's. */
  color?: ConditionColorDto | null;
}>;

/** The icon of a condition in its color, or by its tone: gold for a benefit and the error color
 *  for a harm or an incapacitating one. Never alone: the name always goes with it.
 *
 *  Example: `<ConditionMark icon={condition.icon} tone={condition.tone} color={condition.color} />` */
export function ConditionMark({ icon, tone, color = null }: ConditionMarkProps): React.JSX.Element {
  const Glyph = CONDITION_ICON_ENTRIES[icon].glyph;
  if (color !== null) {
    const style = { color: CONDITION_COLOR_ENTRIES[color].hex };
    return <Glyph aria-hidden="true" data-icon={icon} className="size-4 shrink-0" style={style} />;
  }
  return (
    <Glyph
      aria-hidden="true"
      data-icon={icon}
      className={cn('size-4 shrink-0', tone === 'benefit' ? 'text-primary' : 'text-destructive')}
    />
  );
}
