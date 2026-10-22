import { useId } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { sessionFailureMessage } from '@/features/campaigns/campaign-messages';
import type { InteractionClock } from '@/lib/interaction-clock';
import { tableRosterOf, type RosterMaster, type RosterPlayer } from '@/lib/table-roster';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import {
  useTablePresence,
  type TablePresenceState,
  type TablePresenceStore,
} from '@/stores/table-presence-store';
import { MasterRow } from './master-row';
import { PlayerCard } from './player-card';

export type SessionPresencePanelProps = Readonly<{
  store: StoreApi<TablePresenceStore>;
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
  clock: InteractionClock;
}>;

const STATUS_LABEL: Readonly<Record<Exclude<TablePresenceState['status'], 'failed'>, string>> = {
  connecting: 'Conectando à mesa…',
  // Live is the normal state: nothing to say, only a change gets announced.
  live: '',
  reconnecting: 'Reconectando…',
};

/** "Na mesa": the party board. The masters in a compact section, then a card per player (online
 *  first, offline dimmed at the end), as the server confirmed them, and the connection state.
 *
 *  Example: `<SessionPresencePanel store={table.presence} board={table.board} interaction={interaction} isMaster />` */
export function SessionPresencePanel(props: SessionPresencePanelProps): React.JSX.Element {
  const titleId = useId();
  const status = useTablePresence(props.store, (state) => state.status);
  const failure = useTablePresence(props.store, (state) => state.failure);
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
        <h2 id={titleId} className="text-[13px] font-semibold text-label">
          Na mesa
        </h2>
        {status !== 'failed' && (
          <p role="status" className="text-xs tracking-[0.12em] text-muted-foreground uppercase">
            {STATUS_LABEL[status]}
          </p>
        )}
      </header>
      {failure && failure !== 'unauthenticated' ? (
        <p role="alert" className="text-sm text-destructive-text">
          {sessionFailureMessage(failure)}
        </p>
      ) : (
        <TableSections {...props} />
      )}
    </section>
  );
}

function TableSections(props: SessionPresencePanelProps): React.JSX.Element | null {
  const members = useTablePresence(props.store, (state) => state.members);
  const board = useBoard(props.board, (state) => state.board);
  const serverAt = useTablePresence(props.store, (state) => state.at);
  if (members.length === 0) return null;
  const viewerId = board?.viewer.userId ?? '';
  const roster = tableRosterOf({ members, board, viewerId });
  return (
    <>
      <MastersSection masters={roster.masters} clock={props.clock} serverAt={serverAt} />
      <PlayersSection {...props} players={roster.players} serverAt={serverAt} />
    </>
  );
}

type MastersSectionProps = Readonly<{
  masters: readonly RosterMaster[];
  clock: InteractionClock;
  serverAt: string | null;
}>;

function MastersSection({ masters, clock, serverAt }: MastersSectionProps) {
  const titleId = useId();
  if (masters.length === 0) return null;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <SectionTitle id={titleId}>{masters.length === 1 ? 'Mestre' : 'Mestres'}</SectionTitle>
      <ul className="flex flex-col">
        {masters.map((master) => (
          <MasterRow key={master.member.userId} master={master} clock={clock} serverAt={serverAt} />
        ))}
      </ul>
    </section>
  );
}

type PlayersSectionProps = SessionPresencePanelProps &
  Readonly<{ players: readonly RosterPlayer[]; serverAt: string | null }>;

function PlayersSection({ players, serverAt, ...props }: PlayersSectionProps) {
  const titleId = useId();
  const online = players.filter(({ member }) => member.online).length;
  return (
    <section aria-labelledby={titleId} className="mt-1.5 flex flex-col">
      <SectionTitle id={titleId}>{`Jogadores · ${online} online`}</SectionTitle>
      {players.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum jogador nesta mesa ainda.</p>
      )}
      {players.map((player) => (
        <PlayerCard
          key={player.member.userId}
          player={player}
          board={props.board}
          interaction={props.interaction}
          isMaster={props.isMaster}
          clock={props.clock}
          serverAt={serverAt}
        />
      ))}
    </section>
  );
}

function SectionTitle({ id, children }: Readonly<{ id: string; children: string }>) {
  return (
    <p
      id={id}
      className="px-1 pb-1 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase"
    >
      {children}
    </p>
  );
}
