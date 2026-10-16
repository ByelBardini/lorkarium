import type {
  RealtimeLifecycle,
  RealtimeTransport,
  Unsubscribe,
} from '@/services/realtime-transport';

export type SentMessage = Readonly<{ event: string; payload: unknown }>;

type PendingAck = Readonly<{ resolve: (answer: unknown) => void; reject: (error: Error) => void }>;

/** A socket the test drives: `sent` keeps what the client emitted, `answerAck` / `timeOutAck`
 *  settle the oldest pending ack, `serverEmits` and `lifecycle` play the server's side;
 *  `isConnected()` follows the last `lifecycle` change.
 *
 *  Example: `transport.lifecycle({ kind: 'connected' }); transport.answerAck({ ok: true, state })` */
export class RealtimeTransportFake implements RealtimeTransport {
  readonly sent: SentMessage[] = [];
  connects = 0;
  disconnects = 0;
  private connected = false;
  private readonly pendingAcks: PendingAck[] = [];
  private readonly listeners = new Map<string, Set<(payload: unknown) => void>>();
  private readonly lifecycleListeners = new Set<(change: RealtimeLifecycle) => void>();

  connect(): void {
    this.connects += 1;
  }

  disconnect(): void {
    this.disconnects += 1;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  emit(event: string, payload: unknown): void {
    this.sent.push({ event, payload });
  }

  emitWithAck(event: string, payload: unknown): Promise<unknown> {
    this.sent.push({ event, payload });
    return new Promise((resolve, reject) => this.pendingAcks.push({ resolve, reject }));
  }

  on(event: string, listener: (payload: unknown) => void): Unsubscribe {
    const forEvent = this.listeners.get(event) ?? new Set();
    forEvent.add(listener);
    this.listeners.set(event, forEvent);
    return () => void forEvent.delete(listener);
  }

  onLifecycle(listener: (change: RealtimeLifecycle) => void): Unsubscribe {
    this.lifecycleListeners.add(listener);
    return () => void this.lifecycleListeners.delete(listener);
  }

  async answerAck(answer: unknown): Promise<void> {
    this.oldestPendingAck().resolve(answer);
    await settle();
  }

  async timeOutAck(): Promise<void> {
    this.oldestPendingAck().reject(new Error('operation has timed out'));
    await settle();
  }

  serverEmits(event: string, payload: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }

  lifecycle(change: RealtimeLifecycle): void {
    this.connected = change.kind === 'connected';
    for (const listener of this.lifecycleListeners) listener(change);
  }

  private oldestPendingAck(): PendingAck {
    const pending = this.pendingAcks.shift();
    if (!pending) throw new Error(`no ack pending; sent so far: ${JSON.stringify(this.sent)}`);
    return pending;
  }
}

// Lets the service's `await` on the ack resume before the test asserts.
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
