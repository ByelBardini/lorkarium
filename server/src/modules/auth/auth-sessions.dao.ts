import { eq } from 'drizzle-orm';
import type { Database } from '../../database/database';
import { authSessions, type AuthSessionPo, type NewAuthSessionPo } from './auth-sessions.po';

export class AuthSessionsDao {
  constructor(private readonly db: Database) {}

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
}
