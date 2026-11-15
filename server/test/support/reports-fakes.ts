import type {
  ClosedReportStatus,
  UserReportViewRow,
  UserReportsPage,
  UserReportsPageQuery,
} from '../../src/modules/reports/reports.dao';
import type { UserReportsDao } from '../../src/modules/reports/reports.service';
import type { NewUserReportPo } from '../../src/modules/reports/user-reports.po';

const FAKE_DATE = new Date('2026-11-13T12:00:00Z');

/** The reports in memory, behind the DAO the reports service uses; `usernames` gives each id
 *  its @ (the id itself when unknown). */
export class ReportsDaoFake implements UserReportsDao {
  readonly rows: UserReportViewRow[] = [];

  constructor(private readonly usernames: Readonly<Record<string, string>> = {}) {}

  async insertOpen(report: NewUserReportPo): Promise<boolean> {
    const open = this.rows.some(
      (row) =>
        row.status === 'open' &&
        row.reporterId === report.reporterId &&
        row.targetId === report.targetId,
    );
    if (open) return false;
    this.rows.push(this.viewOf(report));
    return true;
  }

  async pageOf(query: UserReportsPageQuery): Promise<UserReportsPage> {
    const ofStatus = this.rows.filter((row) => row.status === query.status);
    const rows = ofStatus.slice(query.offset, query.offset + query.limit);
    return { rows, total: ofStatus.length };
  }

  async closeOpen(
    reportId: string,
    adminId: string,
    status: ClosedReportStatus,
  ): Promise<UserReportViewRow | undefined> {
    const row = this.rows.find((kept) => kept.id === reportId && kept.status === 'open');
    if (!row) return undefined;
    const resolverUsername = this.usernameOf(adminId);
    Object.assign(row, { status, resolvedBy: adminId, resolvedAt: FAKE_DATE, resolverUsername });
    return row;
  }

  private viewOf(report: NewUserReportPo): UserReportViewRow {
    return {
      id: `00000000-0000-4000-8000-${String(this.rows.length + 1).padStart(12, '0')}`,
      reporterId: report.reporterId,
      targetId: report.targetId,
      reason: report.reason,
      details: report.details ?? null,
      status: 'open',
      resolvedBy: null,
      resolvedAt: null,
      createdAt: FAKE_DATE,
      reporterUsername: this.usernameOf(report.reporterId),
      targetUsername: this.usernameOf(report.targetId),
      resolverUsername: null,
    };
  }

  private usernameOf(userId: string): string {
    return this.usernames[userId] ?? userId;
  }
}
