import { useId } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { sessionFailureMessage } from '@/features/campaigns/campaign-messages';
import type { InteractionClock } from '@/lib/interaction-clock';
import {
  tableRosterOf,
  type RosterMaster,
  type RosterPlayer,
  type RosterRow,
  type RosterSpectator,
} from '@/lib/table-roster';
import { cn } from '@/lib/utils';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useCharacters, type CharactersStore } from '@/stores/characters-store';
import {
  useTablePresence,
  type TablePresenceState,
  type TablePresenceStore,
} from '@/stores/table-presence-store';
import { JuggernautRow } from './juggernaut-row';
import { MasterRow } from './master-row';
import { PlayerCard } from './player-card';
import { SpectatorRow } from './spectator-row';

export type SessionPresencePanelProps = Readonly<{
  store: StoreApi<TablePresenceStore>;
  board: StoreApi<BoardStore>;
  /** The table's characters: each player's card shows theirs. */
  characters: StoreApi<CharactersStore>;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
  /** The campaign's creator (`campaign.ownerId`): first among the masters. */
  ownerId: string;
  clock: InteractionClock;
}>;

const STATUS_LABEL: Readonly<Record<Exclude<TablePresenceState['status'], 'failed'>, string>> = {
  connecting: 'Conectando à mesa…',
  // Live is the normal state: nothing to say, only a change gets announced.
  live: '',
  reconnecting: 'Reconectando…',
};

/** "Na mesa": the party board. The juggernauts online in their own red section, the masters (the
 *  owner first) in a compact one, then a card per player (online first, offline dimmed at the end)
 *  and the spectators online, as the server confirmed them, and the connection state. Each row
 *  offers the role changes the viewer may make (game-core `assignableRolesOf`).
 *
 *  Example: `<SessionPresencePanel store={table.presence} board={table.board} characters={table.characters} interaction={interaction} isMaster />` */
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
  const characters = useCharacters(props.characters, (state) =>
    state.version === null ? null : state.characters,
  );
  const serverAt = useTablePresence(props.store, (state) => state.at);
  const campaignId = useTablePresence(props.store, (state) => state.campaignId);
  if (members.length === 0) return null;
  const viewerId = board?.viewer.userId ?? '';
  const roster = tableRosterOf({ members, board, characters, viewerId, ownerId: props.ownerId });
  const rows = { campaignId, clock: props.clock, serverAt };
  return (
    <>
      <JuggernautsSection juggernauts={roster.juggernauts} {...rows} />
      <MastersSection masters={roster.masters} {...rows} />
      <PlayersSection {...props} players={roster.players} serverAt={serverAt} />
      <SpectatorsSection spectators={roster.spectators} {...rows} />
    </>
  );
}

type RowContext = Readonly<{
  campaignId: string;
  clock: InteractionClock;
  serverAt: string | null;
}>;

// Red is the juggernaut's own warning (the `destructive` tokens), said in words by the title.
function JuggernautsSection({
  juggernauts,
  clock,
  serverAt,
}: RowContext & Readonly<{ juggernauts: readonly RosterRow[] }>) {
  const titleId = useId();
  if (juggernauts.length === 0) return null;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <SectionTitle id={titleId} className="text-destructive-text">
        {juggernauts.length === 1 ? 'Juggernaut' : 'Juggernauts'}
      </SectionTitle>
      <ul className="flex flex-col">
        {juggernauts.map((row) => (
          <JuggernautRow
            key={row.member.userId}
            juggernaut={row}
            clock={clock}
            serverAt={serverAt}
          />
        ))}
      </ul>
    </section>
  );
}

function MastersSection({
  masters,
  ...row
}: RowContext & Readonly<{ masters: readonly RosterMaster[] }>) {
  const titleId = useId();
  if (masters.length === 0) return null;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <SectionTitle id={titleId}>{masters.length === 1 ? 'Mestre' : 'Mestres'}</SectionTitle>
      <ul className="flex flex-col">
        {masters.map((master) => (
          <MasterRow key={master.member.userId} master={master} {...row} />
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

type SpectatorsSectionProps = RowContext & Readonly<{ spectators: readonly RosterSpectator[] }>;

// The table keeps no trace of who only watches: no section at all when nobody is watching now.
function SpectatorsSection({ spectators, ...props }: SpectatorsSectionProps) {
  const titleId = useId();
  if (spectators.length === 0) return null;
  return (
    <section aria-labelledby={titleId} className="mt-1.5 flex flex-col gap-2">
      <SectionTitle id={titleId}>{`Espectadores · ${spectators.length}`}</SectionTitle>
      <ul className="flex flex-col">
        {spectators.map((spectator) => (
          <SpectatorRow key={spectator.member.userId} spectator={spectator} {...props} />
        ))}
      </ul>
    </section>
  );
}

type SectionTitleProps = Readonly<{ id: string; children: string; className?: string }>;

function SectionTitle({ id, children, className }: SectionTitleProps) {
  return (
    <p
      id={id}
      className={cn(
        'px-1 pb-1 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase',
        className,
      )}
    >
      {children}
    </p>
  );
}
