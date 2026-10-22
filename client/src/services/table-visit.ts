import {
  BOARD_EVENTS,
  SESSION_EVENTS,
  boardSyncAckDto,
  sessionJoinAckDto,
  sessionMemberActivityDto,
  sessionMemberJoinedDto,
  sessionMemberLeftDto,
  tokensDraggedDto,
  type ApiErrorDto,
  type SessionJoinAckDto,
} from '@lorkarium/contracts';
import type { z } from 'zod';
import { BOARD_EVENT_SPECS, parseBoardEvent } from './board-events';
import type { RealtimeLifecycle, RealtimeTransport, Unsubscribe } from './realtime-transport';
import type {
  BoardSyncFailure,
  TableSessionFailure,
  TableSessionListener,
  TableSessionUpdate,
} from './table-session-api';

// Past this the ack counts as lost; the socket keeps retrying underneath on its own.
const ACK_TIMEOUT_MS = 5000;

const FAILURE_BY_CODE: Readonly<Record<string, TableSessionFailure>> = {
  CAMPAIGN_NOT_FOUND: 'not_found',
  UNAUTHENTICATED: 'unauthenticated',
  TOO_MANY_TABLES: 'too_many_tables',
};

type AckOutcome<Ack> = Ack | 'offline' | 'unexpected';

/** One open table over the shared connection: joins on every `connected`, then syncs the board,
 *  and hands the listener only validated updates of this table. */
export class TableVisit {
  private closed = false;
  private away = false;
  private readonly unsubscribes: Unsubscribe[] = [];

  constructor(
    private readonly transport: RealtimeTransport,
    private readonly newActionId: () => string,
    private readonly campaignId: string,
    private readonly listener: TableSessionListener,
  ) {}

  /** `alreadyConnected`: the connection another table opened is up, so no `connected` will come. */
  start(alreadyConnected: boolean): void {
    this.notify({ kind: 'status', status: 'connecting' });
    this.unsubscribes.push(
      this.transport.onLifecycle((change) => this.onLifecycle(change)),
      this.transport.on(SESSION_EVENTS.memberJoined, (payload) => this.onMemberJoined(payload)),
      this.transport.on(SESSION_EVENTS.memberLeft, (payload) => this.onMemberLeft(payload)),
      this.transport.on(SESSION_EVENTS.memberActivity, (payload) => this.onMemberActivity(payload)),
      this.transport.on(BOARD_EVENTS.tokensDragged, (payload) => this.onTokensDragged(payload)),
      ...Object.keys(BOARD_EVENT_SPECS).map((name) =>
        this.transport.on(name, (payload) => this.onBoardEvent(name, payload)),
      ),
    );
    if (alreadyConnected) void this.join();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
    this.transport.emit(SESSION_EVENTS.leave, this.command());
  }

  /** Says whether this tab stands still; remembered, so a rejoin after a reconnection says it
   *  again (the server forgets a dropped socket's absence). */
  setAway(away: boolean): void {
    this.away = away;
    if (!this.closed && this.transport.isConnected()) this.sendActivity();
  }

  /** Asks the server for a fresh board snapshot (a version gap, or a retry after a failure). */
  async syncBoard(): Promise<void> {
    const ack = await this.ackOf(BOARD_EVENTS.sync, boardSyncAckDto);
    if (ack === 'offline' || ack === 'unexpected') {
      return this.notify({ kind: 'boardFailed', failure: ack });
    }
    if (!ack.ok) return this.notify({ kind: 'boardFailed', failure: boardFailureOf(ack.error) });
    this.notify({ kind: 'board', state: ack.state });
  }

  private onLifecycle(change: RealtimeLifecycle): void {
    if (change.kind === 'connected') return void this.join();
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
    this.notify({ kind: 'state', state: ack.state });
    this.notify({ kind: 'status', status: 'live' });
    if (this.away && !this.closed) this.sendActivity();
    if (!this.closed) await this.syncBoard();
  }

  private async ackOf<Ack>(event: string, dto: z.ZodType<Ack>): Promise<AckOutcome<Ack>> {
    try {
      const answer = await this.transport.emitWithAck(event, this.command(), ACK_TIMEOUT_MS);
      const parsed = dto.safeParse(answer);
      return parsed.success ? parsed.data : 'unexpected';
    } catch {
      return 'offline';
    }
  }

  private onMemberJoined(payload: unknown): void {
    const parsed = sessionMemberJoinedDto.safeParse(payload);
    if (parsed.success && parsed.data.campaignId === this.campaignId) {
      this.notify({ kind: 'memberJoined', event: parsed.data });
    }
  }

  private onMemberLeft(payload: unknown): void {
    const parsed = sessionMemberLeftDto.safeParse(payload);
    if (parsed.success && parsed.data.campaignId === this.campaignId) {
      this.notify({ kind: 'memberLeft', event: parsed.data });
    }
  }

  private onMemberActivity(payload: unknown): void {
    const parsed = sessionMemberActivityDto.safeParse(payload);
    if (parsed.success && parsed.data.campaignId === this.campaignId) {
      this.notify({ kind: 'memberActivity', event: parsed.data });
    }
  }

  private sendActivity(): void {
    this.transport.emit(SESSION_EVENTS.setActivity, { ...this.command(), away: this.away });
  }

  // A malformed preview is dropped: it changed nothing confirmed, so there is nothing to resync.
  private onTokensDragged(payload: unknown): void {
    const parsed = tokensDraggedDto.safeParse(payload);
    if (parsed.success && parsed.data.campaignId === this.campaignId) {
      this.notify({ kind: 'tokensDragged', drag: parsed.data });
    }
  }

  private onBoardEvent(name: string, payload: unknown): void {
    const parsed = parseBoardEvent(name, payload, this.campaignId);
    if (parsed.kind === 'event') return this.notify({ kind: 'boardEvent', event: parsed.event });
    // A malformed event of this table: what it changed is unknown, so the board starts over.
    if (parsed.kind === 'invalid' && !this.closed) void this.syncBoard();
  }

  private command(): Readonly<{ actionId: string; campaignId: string }> {
    return { actionId: this.newActionId(), campaignId: this.campaignId };
  }

  // An ack or event that lands after close() belongs to a visit the screen already left.
  private notify(update: TableSessionUpdate): void {
    if (!this.closed) this.listener(update);
  }
}

function boardFailureOf(error: ApiErrorDto): BoardSyncFailure {
  if (error.code === 'CAMPAIGN_NOT_FOUND') return 'not_found';
  if (error.code === 'UNAUTHENTICATED') return 'unauthenticated';
  return 'unexpected';
}
