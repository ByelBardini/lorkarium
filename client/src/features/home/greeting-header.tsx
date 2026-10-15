import { formatOverlineDate } from '@/lib/overline-date';
import { greetingFor } from '@/lib/greeting';

export type GreetingHeaderProps = Readonly<{ name: string; now: Date; draw: number }>;

/** The top of the home: today as an overline and the greeting drawn for this visit as `h1`.
 *
 *  Example: `<GreetingHeader name={user.name} now={new Date()} draw={0.3} />` */
export function GreetingHeader({ name, now, draw }: GreetingHeaderProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
        {formatOverlineDate(now)}
      </p>
      <h1 className="font-display text-[40px] leading-[1.05] font-medium sm:text-[48px]">
        {greetingFor(name, draw)}
      </h1>
    </div>
  );
}
