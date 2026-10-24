import { desc, eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { users } from '../auth/users.po';
import { invitations, type InvitationPo, type NewInvitationPo } from './invitations.po';

/** A pending invitation with the @ of who invited (`null` once that account is gone). */
export type InvitationListingRow = InvitationPo & Readonly<{ invitedByUsername: string | null }>;

export class InvitationsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async insert(invitation: NewInvitationPo): Promise<InvitationPo> {
    const [row] = await this.db.insert(invitations).values(invitation).returning();
    if (!row)
      throw new Error(`insert into invitations returned no row for ${invitation.emailIndex}`);
    return row;
  }

  /** Every pending invitation, the newest first. */
  async listPending(): Promise<InvitationListingRow[]> {
    return this.db
      .select({ ...invitationColumns, invitedByUsername: users.username })
      .from(invitations)
      .leftJoin(users, eq(users.id, invitations.invitedBy))
      .orderBy(desc(invitations.sentAt));
  }

  async findListing(invitationId: string): Promise<InvitationListingRow | undefined> {
    const [row] = await this.db
      .select({ ...invitationColumns, invitedByUsername: users.username })
      .from(invitations)
      .leftJoin(users, eq(users.id, invitations.invitedBy))
      .where(eq(invitations.id, invitationId));
    return row;
  }

  async findByTokenHash(tokenHash: string): Promise<InvitationPo | undefined> {
    const [row] = await this.db
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, tokenHash));
    return row;
  }

  async findByEmailIndex(emailIndex: string): Promise<InvitationPo | undefined> {
    const [row] = await this.db
      .select()
      .from(invitations)
      .where(eq(invitations.emailIndex, emailIndex));
    return row;
  }

  /** A new token and deadline: the old link dies. False when the invitation is gone. */
  async renew(
    invitationId: string,
    renewal: Pick<InvitationPo, 'tokenHash' | 'sentAt' | 'expiresAt'>,
  ): Promise<boolean> {
    const updated = await this.db
      .update(invitations)
      .set(renewal)
      .where(eq(invitations.id, invitationId))
      .returning({ id: invitations.id });
    return updated.length > 0;
  }

  /** False when it was already gone (cancelled, or accepted by a concurrent request). */
  async delete(invitationId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(invitations)
      .where(eq(invitations.id, invitationId))
      .returning({ id: invitations.id });
    return deleted.length > 0;
  }
}

const invitationColumns = {
  id: invitations.id,
  tokenHash: invitations.tokenHash,
  emailCipher: invitations.emailCipher,
  emailIndex: invitations.emailIndex,
  role: invitations.role,
  invitedBy: invitations.invitedBy,
  sentAt: invitations.sentAt,
  expiresAt: invitations.expiresAt,
};
