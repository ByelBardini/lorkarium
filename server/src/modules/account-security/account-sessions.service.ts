import type { AccountSessionDto } from '@lorkarium/contracts';
import type { AuthSessionsDao } from '../auth/auth-sessions.dao';
import type { ClockPort } from '../auth/clock.port';
import type { SessionEndedPort } from '../auth/session-ended.port';
import { CurrentSessionError, SessionNotFoundError } from './account-security.error';
import { toAccountSessionDto } from './account-security.mapper';

export type AccountSessionsDeps = Readonly<{
  sessions: Pick<AuthSessionsDao, 'listOf' | 'findOfUser' | 'delete' | 'deleteOthersOf'>;
  sessionEnded: SessionEndedPort;
  clock: ClockPort;
}>;

/** "Where you are signed in": the person's live sessions, ending one or all the others. Every
 *  session ended also drops its realtime connections.
 *
 *  Example: `await accountSessions.revoke(userOf(request).id, sessionIdOf(request), publicId)` */
export class AccountSessionsService {
  constructor(private readonly deps: AccountSessionsDeps) {}

  async list(userId: string, currentSessionId: string): Promise<AccountSessionDto[]> {
    const rows = await this.deps.sessions.listOf(userId, this.deps.clock.now());
    return rows.map((row) => toAccountSessionDto(row, currentSessionId));
  }

  /** Ends the session `publicId` of `userId`; the current one is refused (that is logout). */
  async revoke(userId: string, currentSessionId: string, publicId: string): Promise<void> {
    const row = await this.deps.sessions.findOfUser(userId, publicId);
    if (!row) throw new SessionNotFoundError(userId, publicId);
    if (row.id === currentSessionId) throw new CurrentSessionError(publicId);
    await this.deps.sessions.delete(row.id);
    this.deps.sessionEnded.sessionEnded(row.id);
  }

  /** Ends every session of `userId` but the current one; returns how many ended. */
  async revokeOthers(userId: string, currentSessionId: string): Promise<number> {
    const ended = await this.deps.sessions.deleteOthersOf(userId, currentSessionId);
    for (const sessionId of ended) this.deps.sessionEnded.sessionEnded(sessionId);
    return ended.length;
  }
}
