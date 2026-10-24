import { describe, expect, it } from 'vitest';
import { SocketIoSessionEnded } from '../../../src/infrastructure/session-ended/socket-io-session-ended';

class RealtimeEndingsFake {
  readonly ended: string[] = [];

  endSession(sessionId: string): void {
    this.ended.push(sessionId);
  }
}

describe('SocketIoSessionEnded', () => {
  it('once attached, an ended session drops its realtime connections', () => {
    const realtime = new RealtimeEndingsFake();
    const adapter = new SocketIoSessionEnded();
    adapter.attach(realtime);
    adapter.sessionEnded('sha:cookie');
    expect(realtime.ended).toEqual(['sha:cookie']);
  });

  it('a session ended before the realtime server exists is not replayed once it is attached', () => {
    const adapter = new SocketIoSessionEnded();
    adapter.sessionEnded('sha:early');
    const realtime = new RealtimeEndingsFake();
    adapter.attach(realtime);
    adapter.sessionEnded('sha:late');
    expect(realtime.ended).toEqual(['sha:late']);
  });
});
