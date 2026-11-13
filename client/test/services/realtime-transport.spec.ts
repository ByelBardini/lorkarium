import { REALTIME_PATH } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import type { Socket } from 'socket.io-client';
import { SocketIoRealtimeTransport, realtimeClientOptions } from '@/services/realtime-transport';

describe('realtimeClientOptions', () => {
  it('goes to the websocket first and falls back to polling when it fails, same origin with the cookie', () => {
    expect(realtimeClientOptions()).toEqual({
      path: REALTIME_PATH,
      autoConnect: false,
      withCredentials: true,
      transports: ['websocket', 'polling'],
      tryAllTransports: true,
    });
  });
});

// Only the part of the socket `emitWithAck` touches: `timeout(ms).emitWithAck(...)`.
class TimedSocketFake {
  readonly emitted: unknown[][] = [];
  timeout(): { emitWithAck: (...args: unknown[]) => Promise<unknown> } {
    return {
      emitWithAck: async (...args: unknown[]) => {
        this.emitted.push(args);
        return { ok: true };
      },
    };
  }
}

describe('SocketIoRealtimeTransport.emitWithAck', () => {
  it('sends the payload, or only the ack when the payload is undefined (presence:sync)', async () => {
    const socket = new TimedSocketFake();
    const transport = new SocketIoRealtimeTransport(socket as unknown as Socket);
    await transport.emitWithAck('dm:send', { text: 'oi' }, 5000);
    await transport.emitWithAck('presence:sync', undefined, 5000);
    expect(socket.emitted).toEqual([['dm:send', { text: 'oi' }], ['presence:sync']]);
  });
});
