import { describe, expect, it } from 'vitest';
import { CommandRateGuard } from '../../src/realtime/command-rate-guard';
import { COMMAND_BURST } from '../../src/realtime/command-rate.bo';
import type { RealtimeSocket } from '../../src/realtime/realtime-server';
import { ClockFake } from '../support/auth-fakes';

class RateRefusalFake extends Error {
  constructor(
    readonly socketId: string,
    readonly retryAfterSeconds: number,
  ) {
    super(`socket ${socketId} refused; retry after ${retryAfterSeconds} s`);
  }
}

function socketNamed(id: string): RealtimeSocket {
  return { id } as RealtimeSocket;
}

describe('CommandRateGuard', () => {
  const refusal = (socketId: string, seconds: number): Error =>
    new RateRefusalFake(socketId, seconds);

  it('the command past the burst is refused with the socket and when to retry', () => {
    const guard = new CommandRateGuard(new ClockFake(new Date('2026-10-22T12:00:00Z')), refusal);
    const socket = socketNamed('s1');
    for (let sent = 0; sent < COMMAND_BURST; sent += 1) guard.admit(socket);
    expect(() => guard.admit(socket)).toThrow(
      expect.objectContaining({ socketId: 's1', retryAfterSeconds: 1 }),
    );
  });

  it('one connection emptying its bucket leaves the whole burst to another', () => {
    const guard = new CommandRateGuard(new ClockFake(new Date('2026-10-22T12:00:00Z')), refusal);
    const [flooder, calm] = [socketNamed('s1'), socketNamed('s2')];
    for (let sent = 0; sent < COMMAND_BURST; sent += 1) guard.admit(flooder);
    for (let sent = 0; sent < COMMAND_BURST; sent += 1) guard.admit(calm);
    expect(() => guard.admit(calm)).toThrow(expect.objectContaining({ socketId: 's2' }));
  });
});
