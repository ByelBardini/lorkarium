import {
  REALTIME_PATH,
  type TableClientEvents,
  type TableServerEvents,
} from '@lorkarium/contracts';
import { io, type Socket } from 'socket.io-client';

export type RealtimeClient = Socket<TableServerEvents, TableClientEvents>;

export type RealtimeClientOptions = Readonly<{ token?: string; origin?: string }>;

/** A real `socket.io-client` against the app on an ephemeral port (websocket only, no retry).
 *  Resolves on `connect`, rejects with the `connect_error`.
 *
 *  Example: `const ana = await connectRealtime(baseUrl, { token: anaToken })` */
export function connectRealtime(
  baseUrl: string,
  options: RealtimeClientOptions = {},
): Promise<RealtimeClient> {
  const headers: Record<string, string> = {};
  if (options.token) headers.cookie = `lk_session=${options.token}`;
  if (options.origin) headers.origin = options.origin;
  const socket: RealtimeClient = io(baseUrl, {
    path: REALTIME_PATH,
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    extraHeaders: headers,
  });
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => {
      socket.close();
      reject(error);
    });
  });
}

/** Resolves when the socket is disconnected, with the reason Socket.IO gave.
 *
 *  Example: `expect(await disconnectionOf(socket)).toBe('io server disconnect')` */
export function disconnectionOf(socket: RealtimeClient): Promise<string> {
  if (socket.disconnected) return Promise.resolve('already disconnected');
  return new Promise((resolve) => socket.once('disconnect', (reason) => resolve(reason)));
}

export type RecordedEvent = Readonly<{ name: string; payload: unknown }>;

export type EventRecorder = Readonly<{
  client: RealtimeClient;
  events: readonly RecordedEvent[];
  /** Resolves once `count` events arrived; fails after 2 s citing what did arrive. */
  until: (count: number) => Promise<void>;
}>;

/** Records every server event the client receives, in order.
 *
 *  Example: `const ana = recordEventsOf(client); await ana.until(1); ana.events[0].name` */
export function recordEventsOf(client: RealtimeClient): EventRecorder {
  const events: RecordedEvent[] = [];
  const waiters: Array<() => void> = [];
  client.onAny((name: string, payload: unknown) => {
    events.push({ name, payload });
    for (const wake of waiters.splice(0)) wake();
  });
  const until = async (count: number): Promise<void> => {
    const deadline = Date.now() + 2000;
    while (events.length < count) {
      if (Date.now() > deadline) {
        throw new Error(
          `expected ${count} events, got ${JSON.stringify(events.map((e) => e.name))}`,
        );
      }
      await new Promise<void>((wake) => {
        waiters.push(wake);
        setTimeout(wake, 50);
      });
    }
  };
  return { client, events, until };
}
