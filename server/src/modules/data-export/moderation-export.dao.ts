import { desc, eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { feedbackEntries, type FeedbackEntryPo } from '../feedback/feedback-entries.po';
import { userReports, type UserReportPo } from '../reports/user-reports.po';
import { accountSanctions, type AccountSanctionPo } from '../sanctions/account-sanctions.po';

/** A report the person made, as it reads to them: never the admin's note nor who closed it. */
export type MadeReportRow = Pick<
  UserReportPo,
  | 'targetUsername'
  | 'targetName'
  | 'campaignName'
  | 'reason'
  | 'details'
  | 'status'
  | 'createdAt'
  | 'resolvedAt'
>;
/** A measure the person received, with its appeal: never the report behind it (that protects
 *  whoever reported) nor which admin issued or decided it. */
export type ReceivedSanctionRow = Pick<
  AccountSanctionPo,
  | 'kind'
  | 'rule'
  | 'statement'
  | 'until'
  | 'issuedAt'
  | 'appealReceivedAt'
  | 'appealOutcome'
  | 'appealNote'
  | 'appealDecidedAt'
  | 'deletionDueAt'
>;

/** What the export reads of the moderation: the reports the person **made** (the ones about them
 *  stay out), the measures they received and the feedback still waiting for review.
 *
 *  Example: `await new ModerationExportDao(db).reportsMadeBy(biaId) // [{ reason: 'spam', … }]` */
export class ModerationExportDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async reportsMadeBy(userId: string): Promise<MadeReportRow[]> {
    const r = userReports;
    return this.db
      .select({
        targetUsername: r.targetUsername,
        targetName: r.targetName,
        campaignName: r.campaignName,
        reason: r.reason,
        details: r.details,
        status: r.status,
        createdAt: r.createdAt,
        resolvedAt: r.resolvedAt,
      })
      .from(userReports)
      .where(eq(r.reporterId, userId))
      .orderBy(desc(r.createdAt));
  }

  /** Example: `await moderation.feedbackSentBy(biaId) // [{ kind: 'bug', steps, … }]` */
  async feedbackSentBy(userId: string): Promise<FeedbackEntryPo[]> {
    return this.db
      .select()
      .from(feedbackEntries)
      .where(eq(feedbackEntries.senderId, userId))
      .orderBy(desc(feedbackEntries.createdAt));
  }

  async sanctionsOf(userId: string): Promise<ReceivedSanctionRow[]> {
    const s = accountSanctions;
    return this.db
      .select({
        kind: s.kind,
        rule: s.rule,
        statement: s.statement,
        until: s.until,
        issuedAt: s.issuedAt,
        appealReceivedAt: s.appealReceivedAt,
        appealOutcome: s.appealOutcome,
        appealNote: s.appealNote,
        appealDecidedAt: s.appealDecidedAt,
        deletionDueAt: s.deletionDueAt,
      })
      .from(accountSanctions)
      .where(eq(s.userId, userId))
      .orderBy(desc(s.issuedAt));
  }
}
