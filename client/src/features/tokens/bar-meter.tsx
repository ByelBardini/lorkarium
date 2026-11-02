import type { BarColorDto, TokenBarDto, TokenDto } from '@lorkarium/contracts';
import { barFill, formatBarValue } from '@/lib/bar-display';
import type { SummedBar } from '@/lib/combat-rows';
import { cn } from '@/lib/utils';
import { BarTrack } from './bar-track';

export type BarMeterProps = Readonly<{
  /** Names the meter: "PV de Kael". */
  name: string;
  bar: Pick<TokenBarDto, 'current' | 'max' | 'temp' | 'display'>;
  color: BarColorDto;
  className?: string;
}>;

/** A bar in a line of the panel: the value ("32 / 45", "71%") over a thin track, as a meter.
 *
 *  Example: `<BarMeter name="PV de Kael" bar={pv} color="ember" />` */
export function BarMeter({ name, bar, color, className }: BarMeterProps): React.JSX.Element {
  const fill = barFill(bar);
  return (
    <span
      role="meter"
      aria-label={name}
      aria-valuenow={bar.current}
      aria-valuemin={0}
      aria-valuemax={bar.max}
      aria-valuetext={formatBarValue(bar)}
      className={cn('flex w-16 shrink-0 flex-col items-end gap-1', className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          'text-xs tabular-nums',
          fill.state === 'negative' ? 'text-destructive-text' : 'text-label',
        )}
      >
        {formatBarValue(bar)}
      </span>
      <BarTrack fill={fill} color={color} className="h-1 w-full" />
    </span>
  );
}

/** The bar in position 0 of the token, when this viewer received it (a hidden bar never comes).
 *
 *  Example: `<TokenBarMeter token={kael} />` */
export function TokenBarMeter({ token }: Readonly<{ token: TokenDto }>): React.JSX.Element | null {
  const first = token.bars.find(({ position }) => position === 0);
  if (!first) return null;
  return <BarMeter name={`${first.label} de ${token.name}`} bar={first} color={first.color} />;
}

/** The sum of the bars a group's tokens showed ("Bandido": 42 / 60), in the color of the first. */
export function SummedBarMeter({
  name,
  bar,
  color,
}: Readonly<{ name: string; bar: SummedBar; color: BarColorDto }>): React.JSX.Element {
  return <BarMeter name={name} bar={{ ...bar, display: 'number' }} color={color} />;
}
