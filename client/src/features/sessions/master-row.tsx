import { CrownIcon } from 'lucide-react';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { RosterMaster } from '@/lib/table-roster';
import { cn } from '@/lib/utils';
import { MemberBannerBackdrop } from './member-banner-backdrop';
import { useBannerHover } from './use-banner-hover';
import { NickLine } from './player-card-parts';
import { RowAvatar } from './row-avatar';
import { RoleActionsMenu } from './role-actions-menu';
import { RoleChangeFeedback } from './role-change-confirm';
import { useAwayLabel } from './use-away-label';
import { useRoleChangeFlow } from './use-member-role-change';

export type MasterRowProps = Readonly<{
  master: RosterMaster;
  campaignId: string;
  clock: InteractionClock;
  serverAt: string | null;
}>;

/** A master on the "Na mesa" tab: a compact row — avatar with the presence badge, name and the
 *  seal ("Dono" for the creator, "Mestre" for a co-master) — with no card (the master does not
 *  play with a CA), and the "⋯" that demotes a co-master for whoever holds owner powers.
 *
 *  Example: `<MasterRow master={roster.masters[0]} campaignId={id} clock={clock} serverAt={presence.at} />` */
export function MasterRow({
  master,
  campaignId,
  clock,
  serverAt,
}: MasterRowProps): React.JSX.Element {
  const { member, isViewer } = master;
  const awayLabel = useAwayLabel(member.awaySince, serverAt, clock);
  const flow = useRoleChangeFlow(campaignId, member.userId);
  const hover = useBannerHover();
  return (
    <li
      {...hover.rowHandlers}
      className={cn(
        // -mx-4/px-4: the divider and the banner span the whole panel, edge to edge.
        'relative isolate -mx-4 flex flex-col gap-1 border-b border-divider px-4 py-2.5 last:border-b-0',
        !member.online && 'opacity-60',
      )}
    >
      <MemberBannerBackdrop bannerId={member.bannerId} moving={hover.moving} />
      <div className="flex items-center gap-3">
        <RowAvatar
          member={member}
          size="lg"
          className="outline-2 outline-offset-2 outline-primary"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <NickLine member={member} isViewer={isViewer} awayLabel={awayLabel} />
        </div>
        <span
          data-seal
          className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] text-primary uppercase"
        >
          <CrownIcon aria-hidden="true" className="size-3" />
          {master.owner ? 'Dono' : 'Mestre'}
        </span>
        {flow && (
          <RoleActionsMenu
            name={member.name}
            roles={master.assignable}
            disabled={flow.pending}
            onPick={flow.pick}
          />
        )}
      </div>
      {flow && <RoleChangeFeedback flow={flow} name={member.name} />}
    </li>
  );
}
