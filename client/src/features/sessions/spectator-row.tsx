import { UserPlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/user-avatar';
import type { InteractionClock } from '@/lib/interaction-clock';
import { presenceOf } from '@/lib/member-presence';
import type { RosterSpectator } from '@/lib/table-roster';
import { useMemberRoleChange, type MemberRoleChange } from './use-member-role-change';
import { NickLine } from './player-card-parts';
import { PresenceMark } from './presence-mark';
import { useAwayLabel } from './use-away-label';

export type SpectatorRowProps = Readonly<{
  spectator: RosterSpectator;
  campaignId: string;
  /** Whether the viewer is a master: only the master promotes. */
  isMaster: boolean;
  clock: InteractionClock;
  serverAt: string | null;
}>;

/** A spectator on the "Na mesa" tab, only while online: a compact row — avatar with the presence
 *  badge and the name — and, for the master, "Promover" (the server confirms by moving the person
 *  to the players).
 *
 *  Example: `<SpectatorRow spectator={roster.spectators[0]} campaignId={id} isMaster clock={clock} serverAt={at} />` */
export function SpectatorRow(props: SpectatorRowProps): React.JSX.Element {
  const { member, isViewer } = props.spectator;
  const awayLabel = useAwayLabel(member.awaySince, props.serverAt, props.clock);
  const promotion = useMemberRoleChange(props.campaignId, member.userId);
  const canPromote = props.isMaster && !isViewer && promotion !== null;
  return (
    <li className="flex flex-col gap-1 border-b border-divider py-2 last:border-b-0">
      <div className="flex items-center gap-3">
        <span className="relative shrink-0">
          <UserAvatar name={member.name} color={member.color} avatarId={member.avatarId} />
          <PresenceMark
            presence={presenceOf(member)}
            placement="badge"
            className="-right-0.5 -bottom-0.5"
          />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <NickLine member={member} isViewer={isViewer} awayLabel={awayLabel} />
        </div>
        {canPromote && <PromoteButton name={member.name} promotion={promotion} />}
      </div>
      {promotion?.failure && (
        <p role="alert" className="text-xs text-destructive-text">
          {promotion.failure}
        </p>
      )}
    </li>
  );
}

function PromoteButton({
  name,
  promotion,
}: Readonly<{ name: string; promotion: MemberRoleChange }>): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={`Promover ${name} a jogador`}
      aria-busy={promotion.pending}
      disabled={promotion.pending}
      onClick={() => promotion.change('player')}
    >
      <UserPlusIcon aria-hidden="true" />
      {promotion.pending ? 'Promovendo…' : 'Promover'}
    </Button>
  );
}
