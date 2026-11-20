import type { ClockPort } from '../auth/clock.port';
import type { UserAdminDao } from '../user-admin/user-admin.dao';
import type { UserAdminService } from '../user-admin/user-admin.service';
import { bansEmailFor } from './account-sanction.bo';
import type { AccountSanctionsDao } from './account-sanctions.dao';
import type { AccountSanctionPo } from './account-sanctions.po';
import type { SanctionNoticeService } from './sanction-notice.service';

/** The slice of the pino logger a failed deletion is reported to. */
export type SanctionFollowUpLog = Readonly<{ error: (fields: object, message: string) => void }>;

export type SanctionFollowUpDeps = Readonly<{
  sanctions: Pick<AccountSanctionsDao, 'unnotified' | 'dueBans'>;
  accounts: Pick<UserAdminDao, 'findAccount'>;
  notice: Pick<SanctionNoticeService, 'notify'>;
  deletion: Pick<UserAdminService, 'executeDeletion'>;
  clock: ClockPort;
  log: SanctionFollowUpLog;
}>;

// One batch per sweep: a deletion that keeps failing stays for the next hour, never loops.
export const SANCTION_FOLLOW_UP_BATCH = 100;

/** What the hourly sweep does for the measures: the e-mails that never left go again, then each
 *  ban whose appeal window passed deletes its account (keeping the e-mail's index, except for the
 *  minimum age). A ban is only due once its e-mail left: nobody is deleted without being told.
 *
 *  Example: `await followUp.sweep()` */
export class SanctionFollowUpService {
  constructor(private readonly deps: SanctionFollowUpDeps) {}

  async sweep(): Promise<void> {
    await this.resendMissedNotices();
    await this.deleteDueAccounts();
  }

  private async resendMissedNotices(): Promise<void> {
    for (const sanction of await this.deps.sanctions.unnotified(SANCTION_FOLLOW_UP_BATCH)) {
      const target = await this.deps.accounts.findAccount(sanction.userId);
      if (target) await this.deps.notice.notify(sanction, target);
    }
  }

  private async deleteDueAccounts(): Promise<void> {
    const now = this.deps.clock.now();
    const due = await this.deps.sanctions.dueBans(now, SANCTION_FOLLOW_UP_BATCH);
    for (const ban of due) await this.deleteFor(ban, now);
  }

  private async deleteFor(ban: AccountSanctionPo, now: Date): Promise<void> {
    const options = {
      ban: bansEmailFor(ban.rule) ? { bannedAt: now } : null,
      includeSharedCampaigns: ban.deleteSharedCampaigns,
    };
    try {
      await this.deps.deletion.executeDeletion(ban.userId, options);
    } catch (error) {
      const fields = { err: error, sanctionId: ban.id, userId: ban.userId };
      this.deps.log.error(fields, 'could not delete the account of a due ban; retrying in an hour');
    }
  }
}
