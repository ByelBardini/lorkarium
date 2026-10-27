import type { JuggernautEnderPort } from '../../src/modules/user-admin/juggernaut-ender.port';
import type { UserPo } from '../../src/modules/auth/users.po';
import type {
  AccountListingRow,
  OwnedCampaignRow,
  UserAdminDao,
} from '../../src/modules/user-admin/user-admin.dao';

/** In-memory accounts for the backoffice, each with its campaign count and the tables it owns;
 *  `deleted` keeps the ids removed. */
export class UserAdminDaoFake implements Pick<
  UserAdminDao,
  'listAccounts' | 'findAccount' | 'setRole' | 'setSuspendedAt' | 'lockOwnedCampaigns' | 'delete'
> {
  readonly deleted: string[] = [];
  readonly owned = new Map<string, OwnedCampaignRow[]>();
  private readonly rows: AccountListingRow[];

  constructor(rows: ReadonlyArray<UserPo & { campaignCount?: number }>) {
    this.rows = rows.map((row) => ({ campaignCount: 0, ...row }));
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

  async setSuspendedAt(userId: string, suspendedAt: Date | null): Promise<void> {
    this.patch(userId, { suspendedAt });
  }

  async lockOwnedCampaigns(userId: string): Promise<OwnedCampaignRow[]> {
    return this.owned.get(userId) ?? [];
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

/** Records every account whose memberships were forgotten. */
export class MembershipsForgetFake {
  readonly forgotten: string[] = [];

  forgetUser(userId: string): void {
    this.forgotten.push(userId);
  }
}

/** Records every key removed from the bucket. */
export class StorageRemoveFake {
  readonly removed: string[] = [];

  async remove(key: string): Promise<void> {
    this.removed.push(key);
  }
}

/** Records each account whose juggernaut mode was turned off everywhere and writes
 *  `endAllOf <userId>` to `journal` (share the transaction's journal to read "after the commit").
 *
 *  Example: `new JuggernautEnderFake(journal).ended // [biaId]` */
export class JuggernautEnderFake implements JuggernautEnderPort {
  readonly ended: string[] = [];

  constructor(private readonly journal: string[]) {}

  async endAllOf(userId: string): Promise<void> {
    this.ended.push(userId);
    this.journal.push(`endAllOf ${userId}`);
  }
}
