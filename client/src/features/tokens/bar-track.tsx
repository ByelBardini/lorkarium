import type { BarColorDto } from '@lorkarium/contracts';
import { barToneVar, type BarFill } from '@/lib/bar-display';
import { cn } from '@/lib/utils';

export type BarTrackProps = Readonly<{ fill: BarFill; color: BarColorDto; className?: string }>;

/** The track of a bar, filled in its color; past either end, a second bar grows from the left
 *  (crimson below zero, bone above the maximum), and the temp is a pale strip on the top half, as
 *  on the board.
 *
 *  Example: `<BarTrack fill={barFill(bar)} color={bar.color} />` */
export function BarTrack({ fill, color, className }: BarTrackProps): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={cn('relative block h-1.5 overflow-hidden rounded-full bg-divider', className)}
    >
      <span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${fill.fraction * 100}%`, background: barToneVar(color) }}
      />
      {fill.state !== 'normal' && (
        <span
          data-bar-excess={fill.state}
          className={cn(
            'absolute inset-y-0 left-0 rounded-full',
            fill.state === 'negative' ? 'bg-bar-negative' : 'bg-bar-over',
          )}
          style={{ width: `${fill.excess * 100}%` }}
        />
      )}
      {fill.temp > 0 && (
        <span
          data-bar-temp
          className="absolute top-0 left-0 h-1/2 rounded-full bg-bar-temp"
          style={{ width: `${fill.temp * 100}%` }}
        />
      )}
    </span>
  );
}
