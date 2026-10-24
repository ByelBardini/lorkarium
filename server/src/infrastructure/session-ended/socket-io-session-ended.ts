import type { SessionEndedPort } from '../../modules/auth/session-ended.port';
import type { Realtime } from '../../realtime/realtime-server';

/** Drops the realtime connections of a session that ended. Auth is built before the Socket.IO
 *  server (whose handshake needs auth), so the server is attached afterwards; until then there is
 *  no connection to drop.
 *
 *  Example: `const ended = new SocketIoSessionEnded(); …; ended.attach(realtime)` */
export class SocketIoSessionEnded implements SessionEndedPort {
  private realtime: Pick<Realtime, 'endSession'> | null = null;

  attach(realtime: Pick<Realtime, 'endSession'>): void {
    this.realtime = realtime;
  }

  sessionEnded(sessionId: string): void {
    this.realtime?.endSession(sessionId);
  }
}
