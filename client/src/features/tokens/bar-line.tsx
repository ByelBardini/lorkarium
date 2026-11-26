import type { TokenBarDto } from '@lorkarium/contracts';
import { barFill, formatBarValue } from '@/lib/bar-display';
import { cn } from '@/lib/utils';
import { BarTrack } from './bar-track';

/** A bar in one row: label, a rounded track and the value ("−4 / 38" in the error color). Past
 *  either end the track grows a second bar from the left (crimson below zero, bone above the max).
 *  One row each so a token with five bars still leaves room for the tracker above the dock.
 *
 *  Example: `<BarLine bar={pv} withNumbers />` */
export function BarLine({
  bar,
  withNumbers = false,
}: Readonly<{ bar: TokenBarDto; withNumbers?: boolean }>): React.JSX.Element {
  const fill = barFill(bar);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 shrink-0 truncate text-label" title={bar.label}>
        {bar.label}
      </span>
      <span className="min-w-0 flex-1">
        <BarTrack fill={fill} color={bar.color} />
      </span>
      <span
        className={cn(
          'shrink-0 text-right tabular-nums',
          fill.state === 'negative' ? 'text-destructive-text' : 'text-foreground',
        )}
      >
        {formatBarValue(bar, { withNumbers })}
      </span>
    </div>
  );
}
