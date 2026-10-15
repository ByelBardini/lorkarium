import {
  SESSION_EVENTS,
  sessionJoinAckDto,
  sessionMemberJoinedDto,
  sessionMemberLeftDto,
  type SessionJoinAckDto,
  type SessionMemberJoinedDto,
  type SessionMemberLeftDto,
  type SessionStateDto,
} from '@lorkarium/contracts';
import type { RealtimeLifecycle, RealtimeTransport, Unsubscribe } from './realtime-transport';

export type TableSessionStatus = 'connecting' | 'live' | 'reconnecting';

export type TableSessionFailure = 'not_found' | 'unauthenticated' | 'unexpected' | 'offline';

export type TableSessionUpdate =
  | Readonly<{ kind: 'state'; state: SessionStateDto }>
  | Readonly<{ kind: 'memberJoined'; event: SessionMemberJoinedDto }>
  | Readonly<{ kind: 'memberLeft'; event: SessionMemberLeftDto }>
  | Readonly<{ kind: 'status'; status: TableSessionStatus }>
  | Readonly<{ kind: 'failed'; failure: TableSessionFailure }>;

export type TableSessionListener = (update: TableSessionUpdate) => void;

export type TableSessionHandle = Readonly<{ close: () => void }>;

/** The live session of one table, as the screen sees it: validated updates, never raw packets.
 *
 *  Example: `const handle = tableSessionApi.open(campaignId, (update) => store.apply(update))` */
export interface TableSessionApi {
  open(campaignId: string, listener: TableSessionListener): TableSessionHandle;
}

// Past this the join counts as lost; the socket keeps retrying underneath on its own.
const JOIN_ACK_TIMEOUT_MS = 5000;

const FAILURE_BY_CODE: Readonly<Record<string, TableSessionFailure>> = {
  CAMPAIGN_NOT_FOUND: 'not_found',
  UNAUTHENTICATED: 'unauthenticated',
};

/** `TableSessionApi` over the realtime transport; rejoins on every reconnection, since the
 *  snapshot (not the socket's own recovery) is the source of truth (spec §5.6).
 *
 *  Example: `new RealtimeTableSessionApi(new SocketIoRealtimeTransport(), () => crypto.randomUUID())` */
export class RealtimeTableSessionApi implements TableSessionApi {
  constructor(
    private readonly transport: RealtimeTransport,
    private readonly newActionId: () => string,
  ) {}

  open(campaignId: string, listener: TableSessionListener): TableSessionHandle {
    const visit = new TableVisit(this.transport, this.newActionId, campaignId, listener);
    visit.start();
    return { close: () => visit.close() };
  }
}

class TableVisit {
  private closed = false;
  private readonly unsubscribes: Unsubscribe[] = [];

  constructor(
    private readonly transport: RealtimeTransport,
    private readonly newActionId: () => string,
    private readonly campaignId: string,
    private readonly listener: TableSessionListener,
  ) {}

  start(): void {
    this.notify({ kind: 'status', status: 'connecting' });
    this.unsubscribes.push(
      this.transport.onLifecycle((change) => this.onLifecycle(change)),
      this.transport.on(SESSION_EVENTS.memberJoined, (payload) => this.onMemberJoined(payload)),
      this.transport.on(SESSION_EVENTS.memberLeft, (payload) => this.onMemberLeft(payload)),
    );
    this.transport.connect();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
    this.transport.emit(SESSION_EVENTS.leave, this.command());
    this.transport.disconnect();
  }

  private onLifecycle(change: RealtimeLifecycle): void {
    if (change.kind === 'connected') return void this.join();
    if (change.willRetry) return this.notify({ kind: 'status', status: 'reconnecting' });
    const refusedSession = change.kind === 'connect_failed' && change.code === 'UNAUTHENTICATED';
    this.notify({ kind: 'failed', failure: refusedSession ? 'unauthenticated' : 'offline' });
  }

  private async join(): Promise<void> {
    const ack = await this.joinAck();
    if (ack === 'offline' || ack === 'unexpected')
      return this.notify({ kind: 'failed', failure: ack });
    if (!ack.ok) {
      const failure = FAILURE_BY_CODE[ack.error.code] ?? 'unexpected';
      return this.notify({ kind: 'failed', failure });
    }
    this.notify({ kind: 'state', state: ack.state });
    this.notify({ kind: 'status', status: 'live' });
  }

  private async joinAck(): Promise<SessionJoinAckDto | 'offline' | 'unexpected'> {
    try {
      const answer = await this.transport.emitWithAck(
        SESSION_EVENTS.join,
        this.command(),
        JOIN_ACK_TIMEOUT_MS,
      );
      const parsed = sessionJoinAckDto.safeParse(answer);
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

  private command(): Readonly<{ actionId: string; campaignId: string }> {
    return { actionId: this.newActionId(), campaignId: this.campaignId };
  }

  // An ack or event that lands after close() belongs to a visit the screen already left.
  private notify(update: TableSessionUpdate): void {
    if (!this.closed) this.listener(update);
  }
}
