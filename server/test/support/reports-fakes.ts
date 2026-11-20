import type { UsersDao } from '../../src/modules/auth/users.dao';
import type { UserPo } from '../../src/modules/auth/users.po';
import type { ReportAttachmentsDao } from '../../src/modules/reports/report-attachments.dao';
import type {
  ReportRetentionOutcome,
  ReportRetentionService,
} from '../../src/modules/reports/report-retention.service';
import type {
  NewReportAttachmentPo,
  ReportAttachmentPo,
} from '../../src/modules/reports/report-attachments.po';
import type { ReportedAccount } from '../../src/modules/reports/reports.bo';
import type {
  ReportClosing,
  ReportsDao,
  UserReportViewRow,
  UserReportsPage,
  UserReportsPageQuery,
} from '../../src/modules/reports/reports.dao';
import type { NewUserReportPo } from '../../src/modules/reports/user-reports.po';

export const REPORTS_NOW = new Date('2026-11-19T12:00:00Z');

type FakeReportsDao = Pick<
  ReportsDao,
  | 'accountOf'
  | 'sharedCampaignNameOf'
  | 'insertOpen'
  | 'pageOf'
  | 'closeOpen'
  | 'lockClosedBefore'
  | 'deleteByIds'
>;

/** A table in memory: its name and who plays it (master or player). */
export type FakeTable = Readonly<{ id: string; name: string; players: readonly string[] }>;

/** The reports in memory, behind the DAO the reports services use. `accounts` gives each id its
 *  @ and name (an id missing there does not exist); `tables` the tables and who plays them. */
export class ReportsDaoFake implements FakeReportsDao {
  readonly rows: UserReportViewRow[] = [];
  /** When the next report is created; a spec moves it to make an old one. */
  createdAt: Date = REPORTS_NOW;

  constructor(
    private readonly accounts: Readonly<Record<string, ReportedAccount>> = {},
    private readonly tables: readonly FakeTable[] = [],
  ) {}

  async accountOf(userId: string): Promise<ReportedAccount | undefined> {
    return this.accounts[userId];
  }

  async sharedCampaignNameOf(
    campaignId: string,
    oneId: string,
    otherId: string,
  ): Promise<string | undefined> {
    const table = this.tables.find((kept) => kept.id === campaignId);
    if (!table?.players.includes(oneId) || !table.players.includes(otherId)) return undefined;
    return table.name;
  }

  async insertOpen(report: NewUserReportPo): Promise<string | undefined> {
    if (this.hasOpenPair(report)) return undefined;
    const row = this.viewOf(report);
    this.rows.push(row);
    return row.id;
  }

  async pageOf(query: UserReportsPageQuery): Promise<UserReportsPage> {
    const ofStatus = this.rows.filter((row) => row.status === query.status);
    const rows = ofStatus.slice(query.offset, query.offset + query.limit);
    return { rows, total: ofStatus.length };
  }

  async closeOpen(
    reportId: string,
    closing: ReportClosing,
  ): Promise<UserReportViewRow | undefined> {
    const row = this.rows.find((kept) => kept.id === reportId && kept.status === 'open');
    if (!row) return undefined;
    const resolverUsername = this.accounts[closing.adminId]?.username ?? null;
    const { adminId, status, note } = closing;
    Object.assign(row, { status, resolvedBy: adminId, resolvedAt: REPORTS_NOW, resolverUsername });
    Object.assign(row, { adminNote: note });
    return row;
  }

  async lockClosedBefore(cut: Date, limit: number): Promise<string[]> {
    const expired = this.rows.filter(
      (row) => row.status !== 'open' && row.resolvedAt !== null && row.resolvedAt < cut,
    );
    return expired.slice(0, limit).map((row) => row.id);
  }

  async deleteByIds(reportIds: readonly string[]): Promise<void> {
    const kept = this.rows.filter((row) => !reportIds.includes(row.id));
    this.rows.splice(0, this.rows.length, ...kept);
  }

  private hasOpenPair(report: NewUserReportPo): boolean {
    return this.rows.some(
      (row) =>
        row.status === 'open' &&
        row.reporterId === report.reporterId &&
        row.targetId === report.targetId,
    );
  }

  private viewOf(report: NewUserReportPo): UserReportViewRow {
    return {
      id: `00000000-0000-4000-8000-${String(this.rows.length + 1).padStart(12, '0')}`,
      reporterId: report.reporterId ?? null,
      targetId: report.targetId ?? null,
      reporterUsername: report.reporterUsername,
      targetUsername: report.targetUsername,
      targetName: report.targetName,
      campaignId: report.campaignId ?? null,
      campaignName: report.campaignName ?? null,
      reason: report.reason,
      details: report.details ?? null,
      status: 'open',
      resolvedBy: null,
      resolvedAt: null,
      adminNote: null,
      createdAt: this.createdAt,
      resolverUsername: null,
    };
  }
}

type FakeAttachmentsDao = Pick<
  ReportAttachmentsDao,
  | 'insert'
  | 'lockLooseOf'
  | 'claim'
  | 'listOf'
  | 'findInReport'
  | 'storageKeysOf'
  | 'deleteLooseBefore'
>;

/** One screenshot row, loose and sent by `uploadedBy`, created at `REPORTS_NOW` unless told.
 *
 *  Example: `reportAttachmentPo({ id: shotA, uploadedBy: biaId })` */
export function reportAttachmentPo(
  overrides: Partial<ReportAttachmentPo> = {},
): ReportAttachmentPo {
  const id = overrides.id ?? '00000000-0000-4000-8000-0000000000f1';
  return {
    id,
    reportId: null,
    uploadedBy: null,
    storageKey: `reports/${id}`,
    mimeType: 'image/webp',
    sizeBytes: 900,
    width: 800,
    height: 600,
    createdAt: REPORTS_NOW,
    ...overrides,
  };
}

/** The `report_attachments` table in memory. */
export class ReportAttachmentsDaoFake implements FakeAttachmentsDao {
  readonly rows: ReportAttachmentPo[];

  constructor(rows: ReportAttachmentPo[] = []) {
    this.rows = [...rows];
  }

  async insert(attachment: NewReportAttachmentPo): Promise<ReportAttachmentPo> {
    const row = reportAttachmentPo({ ...attachment, reportId: attachment.reportId ?? null });
    this.rows.push(row);
    return row;
  }

  async lockLooseOf(uploaderId: string, ids: readonly string[]): Promise<string[]> {
    return this.rows
      .filter((row) => ids.includes(row.id) && row.uploadedBy === uploaderId && !row.reportId)
      .map((row) => row.id);
  }

  async claim(reportId: string, ids: readonly string[]): Promise<void> {
    for (const row of this.rows) if (ids.includes(row.id)) row.reportId = reportId;
  }

  async listOf(reportIds: readonly string[]): Promise<ReportAttachmentPo[]> {
    return this.rows.filter((row) => row.reportId !== null && reportIds.includes(row.reportId));
  }

  async findInReport(reportId: string, id: string): Promise<ReportAttachmentPo | undefined> {
    return this.rows.find((row) => row.id === id && row.reportId === reportId);
  }

  async storageKeysOf(reportIds: readonly string[]): Promise<string[]> {
    return (await this.listOf(reportIds)).map((row) => row.storageKey);
  }

  async deleteLooseBefore(cut: Date, limit: number): Promise<string[]> {
    const expired = this.rows.filter((row) => row.reportId === null && row.createdAt < cut);
    const gone = expired.slice(0, limit);
    const kept = this.rows.filter((row) => !gone.includes(row));
    this.rows.splice(0, this.rows.length, ...kept);
    return gone.map((row) => row.storageKey);
  }
}

/** The reporters' rows the closing mail is addressed from (`UsersDao.findById`). */
export class ReportersFake implements Pick<UsersDao, 'findById'> {
  constructor(private readonly rows: readonly UserPo[]) {}

  async findById(userId: string): Promise<UserPo | undefined> {
    return this.rows.find((row) => row.id === userId);
  }
}

/** Runs the work on the fakes as one transaction: a throw puts every row back as it was. */
export class ReportsTransactionFake {
  /** How many transactions were opened. */
  opened = 0;

  constructor(
    private readonly reports: ReportsDaoFake,
    private readonly attachments: ReportAttachmentsDaoFake,
  ) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.opened += 1;
    const reports = this.reports.rows.map((row) => ({ ...row }));
    const attachments = this.attachments.rows.map((row) => ({ ...row }));
    try {
      return await work();
    } catch (error) {
      this.reports.rows.splice(0, this.reports.rows.length, ...reports);
      this.attachments.rows.splice(0, this.attachments.rows.length, ...attachments);
      throw error;
    }
  }
}

/** The reports' retention as the hourly cleanup sees it: counts the purges, or fails with `failure`. */
export class ReportRetentionFake implements Pick<ReportRetentionService, 'purge'> {
  purges = 0;
  failure: Error | null = null;

  async purge(): Promise<ReportRetentionOutcome> {
    if (this.failure) throw this.failure;
    this.purges += 1;
    return { reports: 0, looseAttachments: 0 };
  }
}
