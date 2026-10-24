import type {
  InvitationListingRow,
  InvitationsDao,
} from '../../src/modules/account-links/invitations.dao';
import type { InvitationPo, NewInvitationPo } from '../../src/modules/account-links/invitations.po';
import type { PasswordResetsDao } from '../../src/modules/account-links/password-resets.dao';
import type {
  NewPasswordResetPo,
  PasswordResetPo,
} from '../../src/modules/account-links/password-resets.po';

/** In-memory invitations; `usernameOf` gives the @ of who invited, for the listing. */
export class InvitationsDaoFake implements Pick<
  InvitationsDao,
  | 'insert'
  | 'listPending'
  | 'findListing'
  | 'findByTokenHash'
  | 'findByEmailIndex'
  | 'renew'
  | 'delete'
> {
  rows: InvitationPo[] = [];

  constructor(private readonly usernameOf: (userId: string) => string | null = () => null) {}

  async insert(invitation: NewInvitationPo): Promise<InvitationPo> {
    const row: InvitationPo = {
      id: invitation.id ?? `invitation-${this.rows.length + 1}`,
      invitedBy: null,
      ...invitation,
    };
    this.rows.push(row);
    return row;
  }

  async listPending(): Promise<InvitationListingRow[]> {
    const newest = [...this.rows].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
    return newest.map((row) => this.listing(row));
  }

  async findListing(invitationId: string): Promise<InvitationListingRow | undefined> {
    const row = this.rows.find((candidate) => candidate.id === invitationId);
    return row && this.listing(row);
  }

  async findByTokenHash(tokenHash: string): Promise<InvitationPo | undefined> {
    return this.rows.find((row) => row.tokenHash === tokenHash);
  }

  async findByEmailIndex(emailIndex: string): Promise<InvitationPo | undefined> {
    return this.rows.find((row) => row.emailIndex === emailIndex);
  }

  async renew(
    invitationId: string,
    renewal: Pick<InvitationPo, 'tokenHash' | 'sentAt' | 'expiresAt'>,
  ): Promise<boolean> {
    const at = this.rows.findIndex((row) => row.id === invitationId);
    const row = this.rows[at];
    if (!row) return false;
    this.rows[at] = { ...row, ...renewal };
    return true;
  }

  async delete(invitationId: string): Promise<boolean> {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => row.id !== invitationId);
    return this.rows.length < before;
  }

  private listing(row: InvitationPo): InvitationListingRow {
    return { ...row, invitedByUsername: row.invitedBy ? this.usernameOf(row.invitedBy) : null };
  }
}

/** In-memory password_resets, one per account like the unique index. */
export class PasswordResetsDaoFake implements Pick<
  PasswordResetsDao,
  'replace' | 'findByTokenHash' | 'delete' | 'deleteOfUser'
> {
  rows: PasswordResetPo[] = [];
  private drawn = 0;

  async replace(reset: NewPasswordResetPo): Promise<PasswordResetPo> {
    this.drawn += 1;
    const row: PasswordResetPo = { id: `reset-${this.drawn}`, ...reset };
    this.rows = [...this.rows.filter((kept) => kept.userId !== reset.userId), row];
    return row;
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetPo | undefined> {
    return this.rows.find((row) => row.tokenHash === tokenHash);
  }

  async delete(resetId: string): Promise<boolean> {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => row.id !== resetId);
    return this.rows.length < before;
  }

  async deleteOfUser(userId: string): Promise<void> {
    this.rows = this.rows.filter((row) => row.userId !== userId);
  }
}
