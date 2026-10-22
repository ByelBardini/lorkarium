import { CrownIcon } from 'lucide-react';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { RosterMaster } from '@/lib/table-roster';
import { initialsOf } from '@/lib/token-initials';
import { cn } from '@/lib/utils';
import { NickLine } from './player-card-parts';
import { useAwayLabel } from './use-away-label';

/** A master on the "Na mesa" tab: a compact row — initials, name, presence and the "Mestre"
 *  seal — with no card (the master does not play with a CA).
 *
 *  Example: `<MasterRow master={roster.masters[0]} clock={clock} serverAt={presence.at} />` */
export function MasterRow({
  master,
  clock,
  serverAt,
}: Readonly<{
  master: RosterMaster;
  clock: InteractionClock;
  serverAt: string | null;
}>): React.JSX.Element {
  const { member, isViewer } = master;
  const awayLabel = useAwayLabel(member.awaySince, serverAt, clock);
  return (
    <li
      className={cn(
        'flex items-center gap-3 border-b border-divider py-2.5 last:border-b-0',
        !member.online && 'opacity-60',
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-11 shrink-0 place-items-center rounded-md bg-muted font-brand text-[15px] font-semibold outline-2 -outline-offset-2 outline-primary"
      >
        {initialsOf(member.name)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <NickLine member={member} isViewer={isViewer} awayLabel={awayLabel} />
      </div>
      <span
        data-seal
        className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] text-primary uppercase"
      >
        <CrownIcon aria-hidden="true" className="size-3" />
        Mestre
      </span>
    </li>
  );
}
