import { and, desc, eq, gt, ne } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { authSessions, type AuthSessionPo, type NewAuthSessionPo } from './auth-sessions.po';

export class AuthSessionsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async insert(session: NewAuthSessionPo): Promise<void> {
    await this.db.insert(authSessions).values(session);
  }

  async findById(sessionId: string): Promise<AuthSessionPo | undefined> {
    const [row] = await this.db.select().from(authSessions).where(eq(authSessions.id, sessionId));
    return row;
  }

  async updateExpiry(sessionId: string, expiresAt: Date): Promise<void> {
    await this.db.update(authSessions).set({ expiresAt }).where(eq(authSessions.id, sessionId));
  }

  async delete(sessionId: string): Promise<void> {
    await this.db.delete(authSessions).where(eq(authSessions.id, sessionId));
  }

  /** The sessions of `userId` still valid at `now`, the most recently active first. */
  async listOf(userId: string, now: Date): Promise<AuthSessionPo[]> {
    return this.db
      .select()
      .from(authSessions)
      .where(and(eq(authSessions.userId, userId), gt(authSessions.expiresAt, now)))
      .orderBy(desc(authSessions.lastSeenAt));
  }

  /** The session of `userId` whose public id is `publicId`; another person's is never found. */
  async findOfUser(userId: string, publicId: string): Promise<AuthSessionPo | undefined> {
    const [row] = await this.db
      .select()
      .from(authSessions)
      .where(and(eq(authSessions.userId, userId), eq(authSessions.publicId, publicId)));
    return row;
  }

  async touch(sessionId: string, lastSeenAt: Date): Promise<void> {
    await this.db.update(authSessions).set({ lastSeenAt }).where(eq(authSessions.id, sessionId));
  }

  /** Deletes every session of `userId` but `keptSessionId`; returns the ids (hashes) it deleted. */
  async deleteOthersOf(userId: string, keptSessionId: string): Promise<string[]> {
    const deleted = await this.db
      .delete(authSessions)
      .where(and(eq(authSessions.userId, userId), ne(authSessions.id, keptSessionId)))
      .returning({ id: authSessions.id });
    return deleted.map((row) => row.id);
  }

  /** Deletes every session of `userId`; returns the ids (hashes) it deleted. */
  async deleteAllOf(userId: string): Promise<string[]> {
    const deleted = await this.db
      .delete(authSessions)
      .where(eq(authSessions.userId, userId))
      .returning({ id: authSessions.id });
    return deleted.map((row) => row.id);
  }
}
