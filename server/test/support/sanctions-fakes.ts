import type { UserDeletionCheckDto } from '@lorkarium/contracts';
import type { MailMessage } from '../../src/modules/account-security/mailer.port';
import type { SecurityNoticesService } from '../../src/modules/account-security/security-notices.service';
import type {
  AccountSanctionRow,
  AccountSanctionsDao,
  AppealColumns,
} from '../../src/modules/sanctions/account-sanctions.dao';
import type {
  AccountSanctionPo,
  NewAccountSanctionPo,
} from '../../src/modules/sanctions/account-sanctions.po';
import type {
  AccountDeletionOptions,
  AdminActor,
  UserAdminService,
} from '../../src/modules/user-admin/user-admin.service';

/** In-memory `account_sanctions`: ids handed out in order, the @ of who applied from `usernames`,
 *  and `reports` = the `reportId → targetId` that exist. */
export class AccountSanctionsDaoFake implements Pick<
  AccountSanctionsDao,
  | 'insert'
  | 'findById'
  | 'listOf'
  | 'lockById'
  | 'latestSuspendingIdOf'
  | 'recordAppeal'
  | 'reportIsAbout'
  | 'cancelDeletion'
  | 'cancelDeletionsOf'
  | 'markNotified'
  | 'unnotified'
  | 'dueBans'
> {
  readonly rows: AccountSanctionPo[] = [];
  readonly reports = new Map<string, string>();
  readonly usernames = new Map<string, string>();
  private next = 1;

  async insert(row: NewAccountSanctionPo): Promise<AccountSanctionPo> {
    const stored: AccountSanctionPo = {
      id: `5a0c7100-0000-4000-8000-${String(this.next++).padStart(12, '0')}`,
      until: null,
      reportId: null,
      issuedBy: null,
      issuedAt: new Date(0),
      appealReceivedAt: null,
      appealOutcome: null,
      appealNote: null,
      appealDecidedBy: null,
      appealDecidedAt: null,
      deletionDueAt: null,
      deleteSharedCampaigns: false,
      notifiedAt: null,
      ...row,
    };
    this.rows.push(stored);
    return stored;
  }

  async findById(sanctionId: string): Promise<AccountSanctionRow | undefined> {
    const row = this.rows.find((each) => each.id === sanctionId);
    return row ? this.withUsernames(row) : undefined;
  }

  async listOf(userId: string): Promise<AccountSanctionRow[]> {
    return this.rows
      .filter((row) => row.userId === userId)
      .sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())
      .map((row) => this.withUsernames(row));
  }

  async lockById(sanctionId: string): Promise<AccountSanctionPo | undefined> {
    return this.rows.find((each) => each.id === sanctionId);
  }

  async latestSuspendingIdOf(userId: string): Promise<string | null> {
    const suspending = (await this.listOf(userId)).filter(
      (row) => row.kind === 'suspension' || row.kind === 'ban',
    );
    return suspending[0]?.id ?? null;
  }

  async recordAppeal(sanctionId: string, change: AppealColumns): Promise<void> {
    this.update((row) => row.id === sanctionId, change);
  }

  async reportIsAbout(reportId: string, userId: string): Promise<boolean> {
    return this.reports.get(reportId) === userId;
  }

  async cancelDeletion(sanctionId: string): Promise<void> {
    this.update((row) => row.id === sanctionId, { deletionDueAt: null });
  }

  async cancelDeletionsOf(userId: string): Promise<void> {
    this.update((row) => row.userId === userId, { deletionDueAt: null });
  }

  async markNotified(sanctionId: string, at: Date): Promise<void> {
    this.update((row) => row.id === sanctionId, { notifiedAt: at });
  }

  async unnotified(limit: number): Promise<AccountSanctionPo[]> {
    return this.rows.filter((row) => row.notifiedAt === null).slice(0, limit);
  }

  async dueBans(now: Date, limit: number): Promise<AccountSanctionPo[]> {
    return this.rows
      .filter((row) => row.deletionDueAt !== null && row.deletionDueAt <= now)
      .filter((row) => row.notifiedAt !== null)
      .filter((row) => row.appealReceivedAt === null || row.appealOutcome === 'upheld')
      .slice(0, limit);
  }

  private update(match: (row: AccountSanctionPo) => boolean, change: object): void {
    this.rows.forEach((row, at) => {
      if (match(row)) this.rows[at] = { ...row, ...change };
    });
  }

  private withUsernames(row: AccountSanctionPo): AccountSanctionRow {
    const nameOf = (id: string | null): string | null =>
      id === null ? null : (this.usernames.get(id) ?? null);
    return {
      ...row,
      issuedByUsername: nameOf(row.issuedBy),
      decidedByUsername: nameOf(row.appealDecidedBy),
    };
  }
}

/** The best-effort notices, keeping each e-mail and writing `mail <subject>` to `journal`;
 *  `failing` makes every e-mail fail (nothing kept, `mail failed <subject>` written). */
export class NoticesJournalFake implements Pick<SecurityNoticesService, 'send' | 'deliver'> {
  readonly sent: MailMessage[] = [];
  failing = false;

  constructor(private readonly journal: string[]) {}

  async send(message: MailMessage): Promise<void> {
    await this.deliver(message);
  }

  async deliver(message: MailMessage): Promise<boolean> {
    if (this.failing) {
      this.journal.push(`mail failed ${message.subject}`);
      return false;
    }
    this.sent.push(message);
    this.journal.push(`mail ${message.subject}`);
    return true;
  }
}

/** The backoffice's deletion as the measures see it: `blocking` answers the check; each call is
 *  written to `journal` (`check <id>`, `delete <id> banned <iso|no> shared <yes|no>`) to read the
 *  order; `failFor` makes the deletion of that account throw. */
export class AccountDeletionFake implements Pick<
  UserAdminService,
  'deletionCheck' | 'executeDeletion'
> {
  blocking: UserDeletionCheckDto['blockingCampaigns'] = [];
  failFor: string | null = null;

  constructor(private readonly journal: string[]) {}

  async deletionCheck(_actor: AdminActor, userId: string): Promise<UserDeletionCheckDto> {
    this.journal.push(`check ${userId}`);
    return { blockingCampaigns: this.blocking, soloCampaigns: 0 };
  }

  async executeDeletion(userId: string, options: AccountDeletionOptions): Promise<void> {
    if (this.failFor === userId) throw new Error(`deletion of ${userId} failed`);
    const banned = options.ban?.bannedAt.toISOString() ?? 'no';
    const shared = options.includeSharedCampaigns ? 'yes' : 'no';
    this.journal.push(`delete ${userId} banned ${banned} shared ${shared}`);
  }
}
