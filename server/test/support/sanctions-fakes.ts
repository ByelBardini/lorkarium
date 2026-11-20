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
import type { AccountDeletion } from '../../src/modules/sanctions/sanctions.service';
import type { AccountBan, AdminActor } from '../../src/modules/user-admin/user-admin.service';

/** In-memory `account_sanctions`: ids handed out in order, the @ of who applied from `usernames`,
 *  and `reports` = the `reportId → targetId` that exist. */
export class AccountSanctionsDaoFake implements Pick<
  AccountSanctionsDao,
  | 'insert'
  | 'findById'
  | 'listOf'
  | 'lockById'
  | 'latestSuspensionIdOf'
  | 'recordAppeal'
  | 'reportIsAbout'
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

  async latestSuspensionIdOf(userId: string): Promise<string | null> {
    const suspensions = (await this.listOf(userId)).filter((row) => row.kind === 'suspension');
    return suspensions[0]?.id ?? null;
  }

  async recordAppeal(sanctionId: string, change: AppealColumns): Promise<void> {
    const at = this.rows.findIndex((each) => each.id === sanctionId);
    const row = this.rows[at];
    if (row) this.rows[at] = { ...row, ...change };
  }

  async reportIsAbout(reportId: string, userId: string): Promise<boolean> {
    return this.reports.get(reportId) === userId;
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

/** The best-effort notices, keeping each e-mail and writing `mail <subject>` to `journal`. */
export class NoticesJournalFake implements Pick<SecurityNoticesService, 'send'> {
  readonly sent: MailMessage[] = [];

  constructor(private readonly journal: string[]) {}

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    this.journal.push(`mail ${message.subject}`);
  }
}

/** The backoffice's deletion as a ban sees it: `blocking` answers the check, and each call is
 *  written to `journal` (`check <id>`, `delete <id> banned <iso>`) to read the order. */
export class AccountDeletionFake implements AccountDeletion {
  blocking: UserDeletionCheckDto['blockingCampaigns'] = [];

  constructor(private readonly journal: string[]) {}

  async deletionCheck(_actor: AdminActor, userId: string): Promise<UserDeletionCheckDto> {
    this.journal.push(`check ${userId}`);
    return { blockingCampaigns: this.blocking, soloCampaigns: 0 };
  }

  async delete(_actor: AdminActor, userId: string, ban: AccountBan | null = null): Promise<void> {
    this.journal.push(`delete ${userId} banned ${ban?.bannedAt.toISOString() ?? 'no'}`);
  }
}
