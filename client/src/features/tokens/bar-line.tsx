import type { TokenBarDto } from '@lorkarium/contracts';
import { barFill, formatBarValue } from '@/lib/bar-display';
import { cn } from '@/lib/utils';
import { BarTrack } from './bar-track';

/** A bar as text and a rounded track: label, value ("−4 / 38" in the error color), the fill and,
 *  past either end, a second bar growing from the left (crimson below zero, bone above the max).
 *
 *  Example: `<BarLine bar={pv} withNumbers />` */
export function BarLine({
  bar,
  withNumbers = false,
}: Readonly<{ bar: TokenBarDto; withNumbers?: boolean }>): React.JSX.Element {
  const fill = barFill(bar);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-label">{bar.label}</span>
        <span
          className={cn(
            'tabular-nums',
            fill.state === 'negative' ? 'text-destructive-text' : 'text-foreground',
          )}
        >
          {formatBarValue(bar, { withNumbers })}
        </span>
      </div>
      <BarTrack fill={fill} color={bar.color} />
    </div>
  );
}
