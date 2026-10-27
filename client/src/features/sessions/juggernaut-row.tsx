import { ShieldAlertIcon } from 'lucide-react';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { RosterRow } from '@/lib/table-roster';
import { NickLine } from './player-card-parts';
import { RowAvatar } from './row-avatar';
import { useAwayLabel } from './use-away-label';

export type JuggernautRowProps = Readonly<{
  juggernaut: RosterRow;
  clock: InteractionClock;
  serverAt: string | null;
}>;

/** An admin in juggernaut mode on the "Na mesa" tab, only while online: the compact row in red
 *  (the `destructive` tokens: a warning, not an error) — avatar with the presence badge, name and
 *  the "Juggernaut" seal in words, never the color alone. No "⋯": nobody changes their role.
 *
 *  Example: `<JuggernautRow juggernaut={roster.juggernauts[0]} clock={clock} serverAt={presence.at} />` */
export function JuggernautRow({
  juggernaut,
  clock,
  serverAt,
}: JuggernautRowProps): React.JSX.Element {
  const { member, isViewer } = juggernaut;
  const awayLabel = useAwayLabel(member.awaySince, serverAt, clock);
  return (
    // -mx-4/px-4: the divider spans the whole panel, edge to edge, like the player cards.
    <li className="-mx-4 flex items-center gap-3 border-b border-divider px-4 py-2.5 last:border-b-0">
      <RowAvatar
        member={member}
        size="lg"
        className="outline-2 outline-offset-2 outline-destructive"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <NickLine member={member} isViewer={isViewer} awayLabel={awayLabel} />
      </div>
      <span
        data-seal
        className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] text-destructive-text uppercase"
      >
        <ShieldAlertIcon aria-hidden="true" className="size-3" />
        Juggernaut
      </span>
    </li>
  );
}
