import type {
  BoardStateDto,
  SessionMemberActivityDto,
  SessionMemberJoinedDto,
  SessionMemberLeftDto,
  SessionStateDto,
  TokensDraggedDto,
} from '@lorkarium/contracts';
import type { BoardEvent } from './board-events';
import type { RealtimeTransport } from './realtime-transport';
import { TableVisit } from './table-visit';

export type TableSessionStatus = 'connecting' | 'live' | 'reconnecting';

export type TableSessionFailure =
  'not_found' | 'unauthenticated' | 'too_many_tables' | 'unexpected' | 'offline';

export type BoardSyncFailure = 'not_found' | 'unauthenticated' | 'unexpected' | 'offline';

export type TableSessionUpdate =
  | Readonly<{ kind: 'state'; state: SessionStateDto }>
  | Readonly<{ kind: 'memberJoined'; event: SessionMemberJoinedDto }>
  | Readonly<{ kind: 'memberLeft'; event: SessionMemberLeftDto }>
  | Readonly<{ kind: 'memberActivity'; event: SessionMemberActivityDto }>
  | Readonly<{ kind: 'status'; status: TableSessionStatus }>
  | Readonly<{ kind: 'failed'; failure: TableSessionFailure }>
  | Readonly<{ kind: 'board'; state: BoardStateDto }>
  | Readonly<{ kind: 'boardEvent'; event: BoardEvent }>
  /** Someone else's drag preview (one token or a group): unversioned, so it never goes through
   *  the version check. */
  | Readonly<{ kind: 'tokensDragged'; drag: TokensDraggedDto }>
  | Readonly<{ kind: 'boardFailed'; failure: BoardSyncFailure }>;

export type TableSessionListener = (update: TableSessionUpdate) => void;

export type TableSessionHandle = Readonly<{
  close: () => void;
  /** Asks for a fresh board snapshot; it arrives as a `board` update. */
  resync: () => void;
  /** This tab stood still for a while (`true`) or moved again; kept across reconnections. */
  setAway: (away: boolean) => void;
}>;

/** The live session of one table, as the screen sees it: validated updates, never raw packets.
 *
 *  Example: `const handle = tableSessionApi.open(campaignId, (update) => store.apply(update))` */
export interface TableSessionApi {
  open(campaignId: string, listener: TableSessionListener): TableSessionHandle;
}

/** `TableSessionApi` over the realtime transport; rejoins and syncs the board on every
 *  reconnection, since the snapshot (not the socket's own recovery) is the source of truth
 *  (spec §5.6). Every open table shares one connection: it connects with the first and
 *  disconnects after the last closes.
 *
 *  Example: `new RealtimeTableSessionApi(new SocketIoRealtimeTransport(), () => crypto.randomUUID())` */
export class RealtimeTableSessionApi implements TableSessionApi {
  private readonly visits = new Set<TableVisit>();

  constructor(
    private readonly transport: RealtimeTransport,
    private readonly newActionId: () => string,
  ) {}

  open(campaignId: string, listener: TableSessionListener): TableSessionHandle {
    const visit = new TableVisit(this.transport, this.newActionId, campaignId, listener);
    const isFirst = this.visits.size === 0;
    this.visits.add(visit);
    visit.start(this.transport.isConnected());
    if (isFirst) this.transport.connect();
    return {
      close: () => this.close(visit),
      resync: () => void visit.syncBoard(),
      setAway: (away) => visit.setAway(away),
    };
  }

  private close(visit: TableVisit): void {
    if (!this.visits.delete(visit)) return;
    visit.close();
    if (this.visits.size === 0) this.transport.disconnect();
  }
}
