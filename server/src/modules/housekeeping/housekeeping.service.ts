import type { ClockPort } from '../auth/clock.port';
import type { SchedulerPort } from '../sessions/scheduler.port';
import type { UserPo } from '../auth/users.po';
import type { FeedbackRetentionService } from '../feedback/feedback-retention.service';
import type { ReportRetentionService } from '../reports/report-retention.service';
import type { SanctionFollowUpService } from '../sanctions/sanction-follow-up.service';
import { BANNED_EMAIL_KEPT_MS } from '../sanctions/account-sanction.bo';
import type { HousekeepingDao, SweptTable } from './housekeeping.dao';
import type { SuspensionEndedPort } from './suspension-ended.port';

/** The slice of the pino logger a failed sweep is reported to. */
export type HousekeepingFailureLog = Readonly<{ error: (fields: object, message: string) => void }>;

export type HousekeepingServiceDeps = Readonly<{
  dao: Pick<HousekeepingDao, 'deleteBefore'>;
  expired: Pick<HousekeepingDao, 'liftExpiredSuspensions'>;
  suspensionEnded: SuspensionEndedPort;
  /** The measures: e-mails that never left go again, and the bans whose appeal window passed
   *  delete their accounts. */
  sanctionFollowUp: Pick<SanctionFollowUpService, 'sweep'>;
  /** Closed reports past 6 months and loose screenshots past a day (the reports' own retention). */
  reportRetention: Pick<ReportRetentionService, 'purge'>;
  /** Feedback screenshots no entry claimed in a day (the feedback's own retention). */
  feedbackRetention: Pick<FeedbackRetentionService, 'purge'>;
  clock: ClockPort;
  scheduler: SchedulerPort;
  log: HousekeepingFailureLog;
}>;

export const HOUSEKEEPING_INTERVAL_MS = 60 * 60_000;
// A receipt answers a repeated actionId (a retry after a lost ack); a day later it is a new command.
export const RECEIPT_TTL_MS = 24 * 60 * 60_000;
// The record of who got a service notice is the proof of the warning (CDC art. 27: 5 years); the
// two extra days cover the leap years.
export const BROADCAST_RETENTION_MS = (5 * 365 + 2) * 24 * 60 * 60_000;
// An admin's expired invitation stays a month in the backoffice list, for the admin to resend it;
// after that the address of someone who never joined is not kept (Privacidade §8).
export const ADMIN_INVITATION_KEPT_MS = 30 * 24 * 60 * 60_000;
export const HOUSEKEEPING_BATCH_MAX = 1000;
const SWEEP_TASK = 'housekeeping-sweep';

// How old a row of each table must be to go: receipts after a day, the rest once expired.
const AGE_LIMIT_MS: Readonly<Record<SweptTable, number>> = {
  document_receipts: RECEIPT_TTL_MS,
  sheet_receipts: RECEIPT_TTL_MS,
  sessions: 0,
  challenges: 0,
  signups: 0,
  admin_invitations: ADMIN_INVITATION_KEPT_MS,
  email_changes: 0,
  password_resets: 0,
  recovery_tokens: 0,
  broadcasts: BROADCAST_RETENTION_MS,
  banned_emails: BANNED_EMAIL_KEPT_MS,
};

/** Every hour deletes the receipts a day old, the expired sessions and the expired 2FA steps, a
 *  batch at a time until each table is clean; a failure is logged and waits for the next hour.
 *
 *  Example: `service.start(); …; service.close()` */
export class HousekeepingService {
  private closed = false;

  constructor(private readonly deps: HousekeepingServiceDeps) {}

  start(): void {
    this.scheduleSweep();
  }

  /** Cleans every table now; never rejects. */
  async sweep(): Promise<void> {
    try {
      for (const swept of Object.keys(AGE_LIMIT_MS) as SweptTable[]) await this.clean(swept);
      await this.liftSuspensions();
      if (!this.closed) await this.deps.sanctionFollowUp.sweep();
      if (!this.closed) await this.deps.reportRetention.purge();
      if (!this.closed) await this.deps.feedbackRetention.purge();
    } catch (error) {
      this.deps.log.error({ err: error }, 'housekeeping sweep failed; retrying in an hour');
    }
  }

  close(): void {
    this.closed = true;
    this.deps.scheduler.cancel(SWEEP_TASK);
  }

  private async clean(swept: SweptTable): Promise<void> {
    const cut = new Date(this.deps.clock.now().getTime() - AGE_LIMIT_MS[swept]);
    let deleted = HOUSEKEEPING_BATCH_MAX;
    while (deleted === HOUSEKEEPING_BATCH_MAX && !this.closed)
      deleted = await this.deps.dao.deleteBefore(swept, cut, HOUSEKEEPING_BATCH_MAX);
  }

  // A suspension with an end already stopped holding at the login; this clears the columns and
  // sends the "access is back" e-mail, so nobody has to remember the date.
  private async liftSuspensions(): Promise<void> {
    const now = this.deps.clock.now();
    let lifted: UserPo[];
    do {
      lifted = await this.deps.expired.liftExpiredSuspensions(now, HOUSEKEEPING_BATCH_MAX);
      for (const account of lifted) await this.tellSuspensionEnded(account);
    } while (lifted.length === HOUSEKEEPING_BATCH_MAX && !this.closed);
  }

  private async tellSuspensionEnded(account: UserPo): Promise<void> {
    try {
      await this.deps.suspensionEnded.suspensionEnded(account);
    } catch (error) {
      const fields = { err: error, userId: account.id };
      this.deps.log.error(fields, 'could not tell an account its suspension ended');
    }
  }

  private scheduleSweep(): void {
    if (this.closed) return;
    this.deps.scheduler.schedule(SWEEP_TASK, HOUSEKEEPING_INTERVAL_MS, () => {
      void this.sweep().then(() => this.scheduleSweep());
    });
  }
}
