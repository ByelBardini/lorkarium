import { UserPlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { RosterSpectator } from '@/lib/table-roster';
import { NickLine } from './player-card-parts';
import { RoleActionsMenu } from './role-actions-menu';
import { RoleChangeFeedback } from './role-change-confirm';
import { RowAvatar } from './row-avatar';
import { useAwayLabel } from './use-away-label';
import { useRoleChangeFlow, type RoleChangeFlow } from './use-member-role-change';

export type SpectatorRowProps = Readonly<{
  spectator: RosterSpectator;
  campaignId: string;
  clock: InteractionClock;
  serverAt: string | null;
}>;

/** A spectator on the "Na mesa" tab, only while online: a compact row — avatar with the presence
 *  badge and the name — with "Promover" (to player) and the "⋯" with "Tornar mestre" when the
 *  viewer may give those roles (`spectator.assignable`); the server confirms by moving the person.
 *
 *  Example: `<SpectatorRow spectator={roster.spectators[0]} campaignId={id} clock={clock} serverAt={at} />` */
export function SpectatorRow(props: SpectatorRowProps): React.JSX.Element {
  const { member, isViewer, assignable } = props.spectator;
  const awayLabel = useAwayLabel(member.awaySince, props.serverAt, props.clock);
  const flow = useRoleChangeFlow(props.campaignId, member.userId);
  return (
    <li className="flex flex-col gap-1 border-b border-divider py-2 last:border-b-0">
      <div className="flex items-center gap-3">
        <RowAvatar member={member} />
        <div className="flex min-w-0 flex-1 flex-col">
          <NickLine member={member} isViewer={isViewer} awayLabel={awayLabel} />
        </div>
        {flow && assignable.includes('player') && <PromoteButton name={member.name} flow={flow} />}
        {flow && (
          <RoleActionsMenu
            name={member.name}
            roles={assignable.filter((role) => role !== 'player')}
            disabled={flow.pending}
            onPick={flow.pick}
          />
        )}
      </div>
      {flow && <RoleChangeFeedback flow={flow} name={member.name} />}
    </li>
  );
}

function PromoteButton({
  name,
  flow,
}: Readonly<{ name: string; flow: RoleChangeFlow }>): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={`Promover ${name} a jogador`}
      aria-busy={flow.pending}
      disabled={flow.pending}
      onClick={() => flow.pick('player')}
    >
      <UserPlusIcon aria-hidden="true" />
      {flow.pending ? 'Promovendo…' : 'Promover'}
    </Button>
  );
}
