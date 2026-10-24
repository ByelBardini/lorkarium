import { REALTIME_PATH } from '@lorkarium/contracts';
import { io, type ManagerOptions, type Socket, type SocketOptions } from 'socket.io-client';

/** What happened to the connection itself, apart from the events it carries.
 *  `willRetry` is whether the client reconnects on its own (a network blip) or gave up
 *  (refused by the server, or closed by it). */
export type RealtimeLifecycle =
  | Readonly<{ kind: 'connected' }>
  | Readonly<{ kind: 'disconnected'; willRetry: boolean }>
  | Readonly<{ kind: 'connect_failed'; code: string; willRetry: boolean }>;

export type Unsubscribe = () => void;

/** The only door from the client to Socket.IO; services depend on this, tests on a fake.
 *
 *  Example: `transport.connect(); await transport.emitWithAck('session:join', command, 5000)` */
export interface RealtimeTransport {
  connect(): void;
  disconnect(): void;
  isConnected(): boolean;
  emit(event: string, payload: unknown): void;
  /** Rejects when no ack arrives within `timeoutMs`. */
  emitWithAck(event: string, payload: unknown, timeoutMs: number): Promise<unknown>;
  on(event: string, listener: (payload: unknown) => void): Unsubscribe;
  onLifecycle(listener: (change: RealtimeLifecycle) => void): Unsubscribe;
}

/** How the client opens the realtime connection: the websocket straight away (no polling round
 *  first), and polling only when the websocket fails (`tryAllTransports`, socket.io-client 4.8).
 *
 *  Example: `io(realtimeClientOptions())` */
export function realtimeClientOptions(): Partial<ManagerOptions & SocketOptions> {
  return {
    path: REALTIME_PATH,
    autoConnect: false,
    withCredentials: true,
    transports: ['websocket', 'polling'],
    tryAllTransports: true,
  };
}

/** `RealtimeTransport` over `socket.io-client` at `/api/socket.io`, same origin, cookie included.
 *  Proven end to end by `e2e/test/table-presence.spec.ts`.
 *
 *  Example: `new RealtimeTableSessionApi(new SocketIoRealtimeTransport(), () => crypto.randomUUID())` */
export class SocketIoRealtimeTransport implements RealtimeTransport {
  constructor(private readonly socket: Socket = io(realtimeClientOptions())) {}

  connect(): void {
    this.socket.connect();
  }

  disconnect(): void {
    this.socket.disconnect();
  }

  isConnected(): boolean {
    return this.socket.connected;
  }

  emit(event: string, payload: unknown): void {
    this.socket.emit(event, payload);
  }

  emitWithAck(event: string, payload: unknown, timeoutMs: number): Promise<unknown> {
    return this.socket.timeout(timeoutMs).emitWithAck(event, payload);
  }

  on(event: string, listener: (payload: unknown) => void): Unsubscribe {
    this.socket.on(event, listener);
    return () => void this.socket.off(event, listener);
  }

  onLifecycle(listener: (change: RealtimeLifecycle) => void): Unsubscribe {
    const connected = (): void => listener({ kind: 'connected' });
    const disconnected = (): void =>
      listener({ kind: 'disconnected', willRetry: this.socket.active });
    const failed = (error: Error): void =>
      listener({ kind: 'connect_failed', code: error.message, willRetry: this.socket.active });
    this.socket.on('connect', connected);
    this.socket.on('disconnect', disconnected);
    this.socket.on('connect_error', failed);
    return () => {
      this.socket.off('connect', connected);
      this.socket.off('disconnect', disconnected);
      this.socket.off('connect_error', failed);
    };
  }
}
