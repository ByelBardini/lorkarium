import { and, asc, count, eq, inArray, isNotNull, lt, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DatabaseExecutor } from '../../database/transaction';
import { users } from '../auth/users.po';
import { campaignMembers } from '../campaigns/campaign-members.po';
import { campaigns } from '../campaigns/campaigns.po';
import { playingSeatOf } from '../reputation/reputation.dao';
import type { ReportedAccount } from './reports.bo';
import { userReports, type NewUserReportPo, type UserReportPo } from './user-reports.po';

/** A report with the @ of the admin who closed it (the two sides carry their own @). */
export type UserReportViewRow = UserReportPo & Readonly<{ resolverUsername: string | null }>;

export type UserReportsPageQuery = Readonly<{
  status: UserReportPo['status'];
  limit: number;
  offset: number;
}>;

export type UserReportsPage = Readonly<{ rows: UserReportViewRow[]; total: number }>;

export type ClosedReportStatus = Exclude<UserReportPo['status'], 'open'>;

/** How the admin closes a report: the status and an optional note for the backoffice. */
export type ReportClosing = Readonly<{
  adminId: string;
  status: ClosedReportStatus;
  note: string | null;
}>;

const resolver = alias(users, 'resolver');

const REPORT_COLUMNS = {
  id: userReports.id,
  reporterId: userReports.reporterId,
  targetId: userReports.targetId,
  reporterUsername: userReports.reporterUsername,
  targetUsername: userReports.targetUsername,
  targetName: userReports.targetName,
  campaignId: userReports.campaignId,
  campaignName: userReports.campaignName,
  reason: userReports.reason,
  details: userReports.details,
  status: userReports.status,
  resolvedBy: userReports.resolvedBy,
  resolvedAt: userReports.resolvedAt,
  adminNote: userReports.adminNote,
  createdAt: userReports.createdAt,
};

/** The reports between accounts: written by the reporter, read and closed by the backoffice, and
 *  deleted only by their own retention.
 *
 *  Example: `await new ReportsDao(db).insertOpen({ reporterId, targetId, reason: 'spam', … })` */
export class ReportsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** Example: `await reports.accountOf(caioId) // { username: 'caio', name: 'Caio', suspended: false }` */
  async accountOf(userId: string): Promise<ReportedAccount | undefined> {
    const [row] = await this.db
      .select({
        username: users.username,
        name: users.name,
        suspended: sql<boolean>`${users.suspendedAt} is not null`,
      })
      .from(users)
      .where(eq(users.id, userId));
    return row;
  }

  /** The table's name when both accounts play it (master or player, as the card's "tables in
   *  common"); `undefined` for any other table, including one of another pair.
   *
   *  Example: `await reports.sharedCampaignNameOf(vharnId, biaId, caioId) // 'Os Sinos de Vharn'` */
  async sharedCampaignNameOf(
    campaignId: string,
    oneId: string,
    otherId: string,
  ): Promise<string | undefined> {
    const other = alias(campaignMembers, 'other_member');
    const [row] = await this.db
      .select({ name: campaigns.name })
      .from(campaignMembers)
      .innerJoin(other, eq(other.campaignId, campaignMembers.campaignId))
      .innerJoin(campaigns, eq(campaigns.id, campaignMembers.campaignId))
      .where(
        and(
          eq(campaignMembers.campaignId, campaignId),
          playingSeatOf(campaignMembers, oneId),
          playingSeatOf(other, otherId),
        ),
      )
      .limit(1);
    return row?.name;
  }

  /** The new report's id; `undefined` when the pair already has an open one (nothing is written).
   *
   *  Example: `await reports.insertOpen(row) // '0b1e…'` */
  async insertOpen(report: NewUserReportPo): Promise<string | undefined> {
    const [row] = await this.db
      .insert(userReports)
      .values({ ...report, status: 'open' })
      .onConflictDoNothing()
      .returning({ id: userReports.id });
    return row?.id;
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

  /** Closes an open report with the admin's note; `undefined` for an unknown or closed one.
   *
   *  Example: `await reports.closeOpen(reportId, { adminId: rootId, status: 'dismissed', note: null })` */
  async closeOpen(
    reportId: string,
    closing: ReportClosing,
  ): Promise<UserReportViewRow | undefined> {
    const { adminId, status, note } = closing;
    const closed = await this.db
      .update(userReports)
      .set({ status, resolvedBy: adminId, resolvedAt: sql`now()`, adminNote: note })
      .where(and(eq(userReports.id, reportId), eq(userReports.status, 'open')))
      .returning({ id: userReports.id });
    if (closed.length === 0) return undefined;
    const [row] = await this.viewSelect().where(eq(userReports.id, reportId));
    return row;
  }

  /** Closed reports past the retention cut, locked until the transaction deletes them.
   *
   *  Example: `await reports.lockClosedBefore(cut, 500) // ['0b1e…']` */
  async lockClosedBefore(cut: Date, limit: number): Promise<string[]> {
    const rows = await this.db
      .select({ id: userReports.id })
      .from(userReports)
      .where(
        and(
          ne(userReports.status, 'open'),
          isNotNull(userReports.resolvedAt),
          lt(userReports.resolvedAt, cut),
        ),
      )
      .limit(limit)
      .for('update', { skipLocked: true });
    return rows.map((row) => row.id);
  }

  /** The screenshots go with them (`ON DELETE CASCADE`); their objects must be queued first. */
  async deleteByIds(reportIds: readonly string[]): Promise<void> {
    if (reportIds.length === 0) return;
    await this.db.delete(userReports).where(inArray(userReports.id, [...reportIds]));
  }

  private viewSelect() {
    return this.db
      .select({
        ...REPORT_COLUMNS,
        resolverUsername: resolver.username,
      })
      .from(userReports)
      .leftJoin(resolver, eq(resolver.id, userReports.resolvedBy))
      .$dynamic();
  }
}
