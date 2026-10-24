import type {
  BoardPingedDto,
  BoardStateDto,
  LibraryChangedDto,
  SceneActivatedDto,
  SceneClosedDto,
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
  /** Someone else pointed at a spot of the grid: ephemeral, never board state. */
  | Readonly<{ kind: 'pinged'; event: BoardPingedDto }>
  | Readonly<{ kind: 'boardFailed'; failure: BoardSyncFailure }>
  /** The master took the group to another grid; the group grid syncs again on its own. */
  | Readonly<{ kind: 'sceneActivated'; event: SceneActivatedDto }>
  /** The server took this tab out of a grid (it became private or was deleted). */
  | Readonly<{ kind: 'sceneClosed'; event: SceneClosedDto }>
  /** Something in the library changed: read it again by its route. */
  | Readonly<{ kind: 'libraryChanged'; event: LibraryChangedDto }>;

/** What reaches the store of one grid: its snapshot, its events and the drags over it. */
export type GridUpdate = Extract<
  TableSessionUpdate,
  Readonly<{ kind: 'board' | 'boardEvent' | 'tokensDragged' | 'pinged' | 'boardFailed' }>
>;

export type GridListener = (update: GridUpdate) => void;

/** An extra grid tab of an open table. */
export type GridWatchHandle = Readonly<{
  /** Stops watching (`scene:unwatch`); nothing of that grid reaches the tab after. */
  close: () => void;
  /** Asks for a fresh snapshot of that grid; it arrives as a `board` update. */
  resync: () => void;
}>;

/** The table's cast followed by an open table. */
export type CastHandle = Readonly<{
  /** Asks for a fresh snapshot of the cast; it arrives as a `board` update. */
  resync: () => void;
}>;

export type TableSessionListener = (update: TableSessionUpdate) => void;

export type TableSessionHandle = Readonly<{
  close: () => void;
  /** Asks for a fresh board snapshot; it arrives as a `board` update. */
  resync: () => void;
  /** This tab stood still for a while (`true`) or moved again; kept across reconnections. */
  setAway: (away: boolean) => void;
  /** Opens an extra tab of one grid of this table: its snapshot and events go to `listener`
   *  (the group grid's keep going to the table's), again after every reconnection. */
  watch: (sceneId: string, listener: GridListener) => GridWatchHandle;
  /** Follows the table's cast (`castSceneId` of the campaign detail): its snapshot and events go
   *  to `listener`, again after every reconnection. */
  followCast: (sceneId: string, listener: GridListener) => CastHandle;
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
      watch: (sceneId, listener) => visit.watch(sceneId, listener),
      followCast: (sceneId, listener) => visit.followCast(sceneId, listener),
    };
  }

  private close(visit: TableVisit): void {
    if (!this.visits.delete(visit)) return;
    visit.close();
    if (this.visits.size === 0) this.transport.disconnect();
  }
}
