import { and, asc, count, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DatabaseExecutor } from '../../database/transaction';
import { users } from '../auth/users.po';
import { userReports, type NewUserReportPo, type UserReportPo } from './user-reports.po';

/** A report joined with the @ of both sides and of the admin who closed it. */
export type UserReportViewRow = UserReportPo &
  Readonly<{ reporterUsername: string; targetUsername: string; resolverUsername: string | null }>;

export type UserReportsPageQuery = Readonly<{
  status: UserReportPo['status'];
  limit: number;
  offset: number;
}>;

export type UserReportsPage = Readonly<{ rows: UserReportViewRow[]; total: number }>;

export type ClosedReportStatus = Exclude<UserReportPo['status'], 'open'>;

const reporter = alias(users, 'reporter');
const target = alias(users, 'target');
const resolver = alias(users, 'resolver');

const VIEW_COLUMNS = {
  id: userReports.id,
  reporterId: userReports.reporterId,
  targetId: userReports.targetId,
  reason: userReports.reason,
  details: userReports.details,
  status: userReports.status,
  resolvedBy: userReports.resolvedBy,
  resolvedAt: userReports.resolvedAt,
  createdAt: userReports.createdAt,
  reporterUsername: reporter.username,
  targetUsername: target.username,
  resolverUsername: resolver.username,
};

/** The reports between accounts: written by the reporter, read and closed by the backoffice.
 *
 *  Example: `await new ReportsDao(db).insertOpen({ reporterId, targetId, reason: 'spam' })` */
export class ReportsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** `false` when the pair already has an open report (nothing is written).
   *
   *  Example: `await reports.insertOpen({ reporterId: biaId, targetId: caioId, reason: 'spam' }) // true` */
  async insertOpen(report: NewUserReportPo): Promise<boolean> {
    const rows = await this.db
      .insert(userReports)
      .values({ ...report, status: 'open' })
      .onConflictDoNothing()
      .returning({ id: userReports.id });
    return rows.length > 0;
  }

  /** One page of a status, oldest first, and the total of that status.
   *
   *  Example: `await reports.pageOf({ status: 'open', limit: 50, offset: 0 })` */
  async pageOf(query: UserReportsPageQuery): Promise<UserReportsPage> {
    const rows = await this.viewSelect()
      .where(eq(userReports.status, query.status))
      .orderBy(asc(userReports.createdAt), asc(userReports.id))
      .limit(query.limit)
      .offset(query.offset);
    const [counted] = await this.db
      .select({ total: count() })
      .from(userReports)
      .where(eq(userReports.status, query.status));
    return { rows, total: counted?.total ?? 0 };
  }

  /** Closes an open report; `undefined` for an unknown or already closed one.
   *
   *  Example: `await reports.closeOpen(reportId, rootId, 'dismissed')` */
  async closeOpen(
    reportId: string,
    adminId: string,
    status: ClosedReportStatus,
  ): Promise<UserReportViewRow | undefined> {
    const closed = await this.db
      .update(userReports)
      .set({ status, resolvedBy: adminId, resolvedAt: sql`now()` })
      .where(and(eq(userReports.id, reportId), eq(userReports.status, 'open')))
      .returning({ id: userReports.id });
    if (closed.length === 0) return undefined;
    const [row] = await this.viewSelect().where(eq(userReports.id, reportId));
    return row;
  }

  private viewSelect() {
    return this.db
      .select(VIEW_COLUMNS)
      .from(userReports)
      .innerJoin(reporter, eq(reporter.id, userReports.reporterId))
      .innerJoin(target, eq(target.id, userReports.targetId))
      .leftJoin(resolver, eq(resolver.id, userReports.resolvedBy))
      .$dynamic();
  }
}
