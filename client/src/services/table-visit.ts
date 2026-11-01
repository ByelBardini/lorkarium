import {
  BOARD_EVENTS,
  CHAT_EVENTS,
  DICE_EVENTS,
  SESSION_EVENTS,
  SHEET_EVENTS,
  boardPingedDto,
  boardSyncAckDto,
  chatSentDto,
  diceRolledDto,
  diceRolledSecretlyDto,
  libraryChangedDto,
  imagePresentationChangedDto,
  sceneActivatedDto,
  sceneClosedDto,
  sessionCampaignDeletedDto,
  sessionRemovedFromTableDto,
  sessionCampaignUpdatedDto,
  sessionJoinAckDto,
  sessionMemberActivityDto,
  sessionMemberJoinedDto,
  sessionMemberLeftDto,
  sessionMemberUpdatedDto,
  sheetChangedEventDto,
  tokensDraggedDto,
  type BoardSyncAckDto,
  type LibraryServerEvents,
  type SessionJoinAckDto,
  type TokensDraggedDto,
} from '@lorkarium/contracts';
import type { z } from 'zod';
import { BOARD_EVENT_SPECS, parseBoardEvent, parseVeiledLights } from './board-events';
import type { RealtimeLifecycle, RealtimeTransport, Unsubscribe } from './realtime-transport';
import { CharacterFollow } from './character-follow';
import { syncFailureOf, type AckOutcome } from './sync-failure';
import type {
  CastHandle,
  CharacterListener,
  CharactersHandle,
  GridListener,
  GridUpdate,
  GridWatchHandle,
  TableSessionFailure,
  TableSessionListener,
  TableSessionUpdate,
} from './table-session-api';

// Past this the ack counts as lost; the socket keeps retrying underneath on its own.
const ACK_TIMEOUT_MS = 5000;

const LIBRARY_CHANGED: keyof LibraryServerEvents = 'library:changed';

const FAILURE_BY_CODE: Readonly<Record<string, TableSessionFailure>> = {
  CAMPAIGN_NOT_FOUND: 'not_found',
  UNAUTHENTICATED: 'unauthenticated',
  TOO_MANY_TABLES: 'too_many_tables',
};

type GridWatch = Readonly<{ sceneId: string; listener: GridListener }>;

/** One open table over the shared connection: joins on every `connected`, then syncs the group
 *  grid and watches each extra grid tab, and hands each listener only validated updates of its
 *  grid. */
export class TableVisit {
  private closed = false;
  private away = false;
  private joined = false;
  // Learned from each group snapshot and each activation; until then every event may be the group's.
  private groupSceneId: string | null = null;
  private readonly watches = new Map<string, GridWatch>();
  // The table's cast: synced (never watched) after the group grid, its events only to it.
  private cast: GridWatch | null = null;
  private readonly characters: CharacterFollow;
  private readonly unsubscribes: Unsubscribe[] = [];

  constructor(
    private readonly transport: RealtimeTransport,
    private readonly newActionId: () => string,
    private readonly campaignId: string,
    private readonly listener: TableSessionListener,
  ) {
    this.characters = new CharacterFollow(transport, campaignId, ACK_TIMEOUT_MS);
  }

  /** `alreadyConnected`: the connection another table opened is up, so no `connected` will come. */
  start(alreadyConnected: boolean): void {
    this.notify({ kind: 'status', status: 'connecting' });
    this.unsubscribes.push(
      this.transport.onLifecycle((change) => this.onLifecycle(change)),
      ...this.tableEventSubscriptions(),
      ...this.characters.subscriptions(),
      this.transport.on(BOARD_EVENTS.tokensDragged, (payload) => this.onTokensDragged(payload)),
      this.transport.on(BOARD_EVENTS.pinged, (payload) => this.onPinged(payload)),
      this.transport.on(BOARD_EVENTS.veiledLightsChanged, (payload) =>
        this.onVeiledLights(payload),
      ),
      ...Object.keys(BOARD_EVENT_SPECS).map((name) =>
        this.transport.on(name, (payload) => this.onBoardEvent(name, payload)),
      ),
    );
    if (alreadyConnected) void this.join();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.watches.clear();
    this.characters.stop();
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
    this.transport.emit(SESSION_EVENTS.leave, this.command());
  }

  /** Says whether this tab stands still; remembered, so a rejoin after a reconnection says it
   *  again (the server forgets a dropped socket's absence). */
  setAway(away: boolean): void {
    this.away = away;
    if (!this.closed && this.transport.isConnected()) this.sendActivity();
  }

  /** Asks the server for a fresh snapshot of the group grid (a version gap, or a retry). */
  async syncBoard(): Promise<void> {
    const update = snapshotUpdateOf(await this.ackOf(BOARD_EVENTS.sync, boardSyncAckDto));
    if (update.kind === 'board') this.groupSceneId = update.state.scene.id;
    this.notify(update);
  }

  /** Opens an extra tab of `sceneId`: watched now if the table is joined, else after the join. */
  watch(sceneId: string, listener: GridListener): GridWatchHandle {
    const watch: GridWatch = { sceneId, listener };
    this.watches.set(sceneId, watch);
    if (this.joined) void this.syncWatch(watch);
    return { close: () => this.unwatch(watch), resync: () => void this.syncWatch(watch) };
  }

  /** Follows the table's cast (the anchors of the characters): a `board:sync` of it now if the
   *  table is joined, else after the join, and again after every reconnection. Every member is
   *  in its rooms from the join, so there is nothing to watch. */
  followCast(sceneId: string, listener: GridListener): CastHandle {
    const cast: GridWatch = { sceneId, listener };
    this.cast = cast;
    if (this.joined) void this.syncCast(cast);
    return { resync: () => void this.syncCast(cast) };
  }

  /** Follows the table's characters: a `character:sync` now if the table is joined, else after
   *  the join, and again after every reconnection. */
  followCharacters(listener: CharacterListener): CharactersHandle {
    return this.characters.follow(listener, this.joined);
  }

  private async syncCast(cast: GridWatch): Promise<void> {
    const ack = await this.ackOf(BOARD_EVENTS.sync, boardSyncAckDto, { sceneId: cast.sceneId });
    if (!this.closed && this.cast === cast) cast.listener(snapshotUpdateOf(ack));
  }

  private async syncWatch(watch: GridWatch): Promise<void> {
    const fields = { sceneId: watch.sceneId };
    const ack = await this.ackOf(BOARD_EVENTS.watchScene, boardSyncAckDto, fields);
    this.toWatch(watch, snapshotUpdateOf(ack));
  }

  private unwatch(watch: GridWatch): void {
    if (this.watches.get(watch.sceneId) !== watch) return;
    this.watches.delete(watch.sceneId);
    if (this.closed || !this.transport.isConnected()) return;
    this.transport.emit(BOARD_EVENTS.unwatchScene, { ...this.command(), sceneId: watch.sceneId });
  }

  private onLifecycle(change: RealtimeLifecycle): void {
    if (change.kind === 'connected') return void this.join();
    this.joined = false;
    if (change.willRetry) return this.notify({ kind: 'status', status: 'reconnecting' });
    const refusedSession = change.kind === 'connect_failed' && change.code === 'UNAUTHENTICATED';
    this.notify({ kind: 'failed', failure: refusedSession ? 'unauthenticated' : 'offline' });
  }

  private async join(): Promise<void> {
    const ack: AckOutcome<SessionJoinAckDto> = await this.ackOf(
      SESSION_EVENTS.join,
      sessionJoinAckDto,
    );
    if (ack === 'offline' || ack === 'unexpected') {
      return this.notify({ kind: 'failed', failure: ack });
    }
    if (!ack.ok) {
      const failure = FAILURE_BY_CODE[ack.error.code] ?? 'unexpected';
      return this.notify({ kind: 'failed', failure });
    }
    this.joined = true;
    this.notify({ kind: 'state', state: ack.state });
    this.notify({ kind: 'status', status: 'live' });
    if (this.away && !this.closed) this.sendActivity();
    if (this.closed) return;
    await this.syncBoard();
    if (this.cast) void this.syncCast(this.cast);
    void this.characters.sync();
    for (const watch of this.watches.values()) void this.syncWatch(watch);
  }

  private async ackOf<Ack>(
    event: string,
    dto: z.ZodType<Ack>,
    fields: object = {},
  ): Promise<AckOutcome<Ack>> {
    try {
      const payload = { ...this.command(), ...fields };
      const answer = await this.transport.emitWithAck(event, payload, ACK_TIMEOUT_MS);
      const parsed = dto.safeParse(answer);
      return parsed.success ? parsed.data : 'unexpected';
    } catch {
      return 'offline';
    }
  }

  private tableEventSubscriptions(): Unsubscribe[] {
    const { memberJoined, memberLeft, memberActivity, memberUpdated } = SESSION_EVENTS;
    return [
      this.onTableEvent(memberJoined, sessionMemberJoinedDto, (event) =>
        this.notify({ kind: 'memberJoined', event }),
      ),
      this.onTableEvent(memberLeft, sessionMemberLeftDto, (event) =>
        this.notify({ kind: 'memberLeft', event }),
      ),
      this.onTableEvent(memberActivity, sessionMemberActivityDto, (event) =>
        this.notify({ kind: 'memberActivity', event }),
      ),
      this.onTableEvent(memberUpdated, sessionMemberUpdatedDto, (event) =>
        this.notify({ kind: 'memberUpdated', event }),
      ),
      ...this.campaignEventSubscriptions(),
      ...this.diceEventSubscriptions(),
      // Like a roll: a malformed message is dropped with no resync, nothing is saved.
      this.onTableEvent(CHAT_EVENTS.sent, chatSentDto, (event) =>
        this.notify({ kind: 'chatSent', event }),
      ),
      this.onTableEvent(BOARD_EVENTS.sceneActivated, sceneActivatedDto, (event) => {
        this.groupSceneId = event.sceneId;
        this.notify({ kind: 'sceneActivated', event });
        if (!this.closed) void this.syncBoard();
      }),
      this.onTableEvent(BOARD_EVENTS.sceneClosed, sceneClosedDto, (event) => {
        // The server already forgot this tab: no unwatch, and no watch again on a reconnection.
        this.watches.delete(event.sceneId);
        this.notify({ kind: 'sceneClosed', event });
      }),
      this.onTableEvent('library:imagePresentationChanged', imagePresentationChangedDto, (event) =>
        this.notify({ kind: 'imagePresentationChanged', event }),
      ),
      this.onTableEvent(LIBRARY_CHANGED, libraryChangedDto, (event) =>
        this.notify({ kind: 'libraryChanged', event }),
      ),
      this.onTableEvent(SHEET_EVENTS.changed, sheetChangedEventDto, (event) =>
        this.notify({ kind: 'sheetChanged', event }),
      ),
    ];
  }

  private campaignEventSubscriptions(): Unsubscribe[] {
    const { campaignUpdated, campaignDeleted, removedFromTable } = SESSION_EVENTS;
    return [
      this.onTableEvent(campaignUpdated, sessionCampaignUpdatedDto, (event) =>
        this.notify({ kind: 'campaignUpdated', event }),
      ),
      this.onTableEvent(campaignDeleted, sessionCampaignDeletedDto, (event) =>
        this.notify({ kind: 'campaignDeleted', event }),
      ),
      this.onTableEvent(removedFromTable, sessionRemovedFromTableDto, (event) =>
        this.notify({ kind: 'removedFromTable', event }),
      ),
    ];
  }

  // A malformed roll is dropped with no resync: nothing is saved, so there is nothing to fetch.
  private diceEventSubscriptions(): Unsubscribe[] {
    return [
      this.onTableEvent(DICE_EVENTS.rolled, diceRolledDto, (event) =>
        this.notify({ kind: 'diceRolled', event }),
      ),
      this.onTableEvent(DICE_EVENTS.rolledSecretly, diceRolledSecretlyDto, (event) =>
        this.notify({ kind: 'diceRolledSecretly', event }),
      ),
    ];
  }

  // Only valid events of this table; any other is not ours (or changed nothing confirmed).
  private onTableEvent<E extends Readonly<{ campaignId: string }>>(
    name: string,
    dto: z.ZodType<E>,
    deliver: (event: E) => void,
  ): Unsubscribe {
    return this.transport.on(name, (payload) => {
      const parsed = dto.safeParse(payload);
      if (parsed.success && parsed.data.campaignId === this.campaignId) deliver(parsed.data);
    });
  }

  private sendActivity(): void {
    this.transport.emit(SESSION_EVENTS.setActivity, { ...this.command(), away: this.away });
  }

  // A malformed preview is dropped: it changed nothing confirmed, so there is nothing to resync.
  // A preview naming no grid is the group grid's.
  private onTokensDragged(payload: unknown): void {
    const parsed = tokensDraggedDto.safeParse(payload);
    if (!parsed.success || parsed.data.campaignId !== this.campaignId) return;
    const drag: TokensDraggedDto = parsed.data;
    if (drag.sceneId === undefined) return this.notify({ kind: 'tokensDragged', drag });
    this.route(drag.sceneId, { kind: 'tokensDragged', drag });
  }

  // Like the preview: a malformed ping changed nothing, so it is dropped with no resync.
  private onPinged(payload: unknown): void {
    const parsed = boardPingedDto.safeParse(payload);
    if (!parsed.success || parsed.data.campaignId !== this.campaignId) return;
    this.route(parsed.data.sceneId, { kind: 'pinged', event: parsed.data });
  }

  // Like the preview: the list is all there is, so a malformed one is dropped with no resync.
  private onVeiledLights(payload: unknown): void {
    const event = parseVeiledLights(payload, this.campaignId);
    if (event) this.route(event.sceneId, { kind: 'veiledLights', event });
  }

  private onBoardEvent(name: string, payload: unknown): void {
    const parsed = parseBoardEvent(name, payload, this.campaignId);
    if (parsed.kind === 'event') {
      return this.route(parsed.event.payload.sceneId, { kind: 'boardEvent', event: parsed.event });
    }
    // A malformed event of this table: what it changed is unknown, so its grid starts over.
    if (parsed.kind === 'invalid' && !this.closed) this.resyncGridOf(payload);
  }

  private route(sceneId: string, update: GridUpdate): void {
    if (this.cast?.sceneId === sceneId) return this.toCast(this.cast, update);
    if (this.groupSceneId === null || this.groupSceneId === sceneId) this.notify(update);
    const watch = this.watches.get(sceneId);
    if (watch) this.toWatch(watch, update);
  }

  private resyncGridOf(payload: unknown): void {
    const sceneId = sceneIdOf(payload);
    if (this.cast?.sceneId === sceneId) return void this.syncCast(this.cast);
    const watch = this.watches.get(sceneId);
    if (watch) return void this.syncWatch(watch);
    void this.syncBoard();
  }

  private command(): Readonly<{ actionId: string; campaignId: string }> {
    return { actionId: this.newActionId(), campaignId: this.campaignId };
  }

  // An update for a tab closed meanwhile (or after the visit closed) is no one's any more.
  private toWatch(watch: GridWatch, update: GridUpdate): void {
    if (!this.closed && this.watches.get(watch.sceneId) === watch) watch.listener(update);
  }

  private toCast(cast: GridWatch, update: GridUpdate): void {
    if (!this.closed) cast.listener(update);
  }

  // An ack or event that lands after close() belongs to a visit the screen already left.
  private notify(update: TableSessionUpdate): void {
    if (!this.closed) this.listener(update);
  }
}

function snapshotUpdateOf(ack: AckOutcome<BoardSyncAckDto>): GridUpdate {
  if (ack === 'offline' || ack === 'unexpected') return { kind: 'boardFailed', failure: ack };
  if (!ack.ok) return { kind: 'boardFailed', failure: syncFailureOf(ack.error) };
  return { kind: 'board', state: ack.state };
}

function sceneIdOf(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null || !('sceneId' in payload)) return '';
  return typeof payload.sceneId === 'string' ? payload.sceneId : '';
}
