import type { UserPo } from '../../src/modules/auth/users.po';
import type { RevokedAdminSeat } from '../../src/modules/campaigns/campaign-members.dao';
import type { BannedEmailIndexesDao } from '../../src/modules/sanctions/banned-email-indexes.dao';
import type { OwnerLimitsPort } from '../../src/modules/user-admin/owner-limits.port';
import type { RevokedSeatsPort } from '../../src/modules/user-admin/revoked-seats.port';
import type {
  AccountListingRow,
  OwnedCampaignRow,
  UserAdminDao,
} from '../../src/modules/user-admin/user-admin.dao';

/** In-memory accounts for the backoffice, each with its campaign count, the tables it owns and the
 *  storage keys of those tables' files (`ownedKeys`); `deleted` keeps the ids removed. */
export class UserAdminDaoFake implements Pick<
  UserAdminDao,
  | 'listAccounts'
  | 'findAccount'
  | 'setRole'
  | 'setPlan'
  | 'setSuspendedAt'
  | 'lockOwnedCampaigns'
  | 'storageKeysOfOwnedCampaigns'
  | 'delete'
> {
  readonly deleted: string[] = [];
  readonly owned = new Map<string, OwnedCampaignRow[]>();
  readonly ownedKeys = new Map<string, string[]>();
  private readonly rows: AccountListingRow[];

  constructor(rows: ReadonlyArray<UserPo & { campaignCount?: number; lorkariumOwner?: boolean }>) {
    this.rows = rows.map((row) => ({
      campaignCount: 0,
      lorkariumOwner: false,
      activePaidPlan: null,
      activePaidPlanUntil: null,
      ...row,
    }));
  }

  async listAccounts(): Promise<AccountListingRow[]> {
    return [...this.rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findAccount(userId: string): Promise<AccountListingRow | undefined> {
    return this.rows.find((row) => row.id === userId);
  }

  async setRole(userId: string, role: UserPo['role']): Promise<void> {
    this.patch(userId, { role });
  }

  async setPlan(userId: string, plan: UserPo['plan']): Promise<void> {
    this.patch(userId, { plan });
  }

  async setSuspendedAt(
    userId: string,
    suspendedAt: Date | null,
    suspendedUntil: Date | null = null,
  ): Promise<void> {
    this.patch(userId, { suspendedAt, suspendedUntil: suspendedAt ? suspendedUntil : null });
  }

  async lockOwnedCampaigns(userId: string): Promise<OwnedCampaignRow[]> {
    return this.owned.get(userId) ?? [];
  }

  async storageKeysOfOwnedCampaigns(userId: string): Promise<string[]> {
    return this.ownedKeys.get(userId) ?? [];
  }

  async delete(userId: string): Promise<void> {
    this.deleted.push(userId);
    const at = this.rows.findIndex((row) => row.id === userId);
    if (at >= 0) this.rows.splice(at, 1);
  }

  private patch(userId: string, changes: Partial<AccountListingRow>): void {
    const at = this.rows.findIndex((row) => row.id === userId);
    const row = this.rows[at];
    if (row) this.rows[at] = { ...row, ...changes };
  }
}

/** Keeps the banned e-mail indexes by when they were banned; writes `ban <index>` to `journal`
 *  (to read that it happened inside the deletion's transaction). */
export class BannedEmailsFake implements Pick<BannedEmailIndexesDao, 'ban' | 'isBannedSince'> {
  readonly banned = new Map<string, Date>();

  constructor(private readonly journal: string[] = []) {}

  async ban(emailIndex: string, bannedAt: Date): Promise<void> {
    this.banned.set(emailIndex, bannedAt);
    this.journal.push(`ban ${emailIndex}`);
  }

  async isBannedSince(emailIndex: string, since: Date): Promise<boolean> {
    const at = this.banned.get(emailIndex);
    return at !== undefined && at.getTime() > since.getTime();
  }
}

/** Records every account whose memberships were forgotten. */
export class MembershipsForgetFake {
  readonly forgotten: string[] = [];

  forgetUser(userId: string): void {
    this.forgotten.push(userId);
  }
}

/** The seats a transaction finds to revoke (`seats`, set by the spec); writes
 *  `revoke <userId>` to `journal`, to read that it happened before the commit.
 *
 *  Example: `new AdminSeatsFake(journal).revokedFor // [biaId]` */
export class AdminSeatsFake {
  readonly revokedFor: string[] = [];
  seats: RevokedAdminSeat[] = [];

  constructor(private readonly journal: string[]) {}

  async revokeAdminSeatsOf(userId: string): Promise<RevokedAdminSeat[]> {
    this.revokedFor.push(userId);
    this.journal.push(`revoke ${userId}`);
    return this.seats;
  }
}

/** Records what the tables were told and writes `announce <userId>` to `journal`.
 *
 *  Example: `new RevokedSeatsFake(journal).announced // [{ userId, seats }]` */
export class RevokedSeatsFake implements RevokedSeatsPort {
  readonly announced: Array<{ userId: string; seats: readonly RevokedAdminSeat[] }> = [];

  constructor(private readonly journal: string[]) {}

  async announceRevoked(userId: string, seats: readonly RevokedAdminSeat[]): Promise<void> {
    this.announced.push({ userId, seats });
    this.journal.push(`announce ${userId}`);
  }
}

/** Records each owner whose tables were told their new limits and writes `limits <ownerId>` to
 *  `journal`, to read that it happened after the commit.
 *
 *  Example: `new OwnerLimitsFake(journal).told // [biaId]` */
export class OwnerLimitsFake implements OwnerLimitsPort {
  readonly told: string[] = [];

  constructor(private readonly journal: string[]) {}

  async ownerLimitsChanged(ownerId: string): Promise<void> {
    this.told.push(ownerId);
    this.journal.push(`limits ${ownerId}`);
  }
}
