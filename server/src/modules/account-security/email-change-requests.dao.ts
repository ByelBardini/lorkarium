import { eq, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import {
  emailChangeRequests,
  type EmailChangeRequestPo,
  type NewEmailChangeRequestPo,
} from './email-change-requests.po';

export class EmailChangeRequestsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** Stores the request, replacing the user's previous one: its link stops working. */
  async replace(request: NewEmailChangeRequestPo): Promise<void> {
    const { id, emailCipher, emailIndex, expiresAt } = request;
    await this.db
      .insert(emailChangeRequests)
      .values(request)
      .onConflictDoUpdate({
        target: emailChangeRequests.userId,
        set: { id, emailCipher, emailIndex, expiresAt, createdAt: sql`now()` },
      });
  }

  async findById(requestId: string): Promise<EmailChangeRequestPo | undefined> {
    const [row] = await this.db
      .select()
      .from(emailChangeRequests)
      .where(eq(emailChangeRequests.id, requestId));
    return row;
  }

  async findOfUser(userId: string): Promise<EmailChangeRequestPo | undefined> {
    const [row] = await this.db
      .select()
      .from(emailChangeRequests)
      .where(eq(emailChangeRequests.userId, userId));
    return row;
  }

  async deleteOfUser(userId: string): Promise<void> {
    await this.db.delete(emailChangeRequests).where(eq(emailChangeRequests.userId, userId));
  }
}
