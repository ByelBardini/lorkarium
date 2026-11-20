import type {
  ListUserReportsQueryDto,
  ResolveUserReportRequestDto,
  UserReportDto,
  UserReportRequestDto,
  UserReportsPageDto,
} from '@lorkarium/contracts';
import { recipientOf } from '../account-security/security-mail.mapper';
import type { SecurityNoticesService } from '../account-security/security-notices.service';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { UsersDao } from '../auth/users.dao';
import type { UserPo } from '../auth/users.po';
import type { ReportAttachmentsDao } from './report-attachments.dao';
import type { ReportAttachmentPo } from './report-attachments.po';
import { reportReviewedMail } from './report-mail.mapper';
import { UserReportBo, type ReportedAccount } from './reports.bo';
import type { ReportsDao, UserReportViewRow } from './reports.dao';
import { ReportsError } from './reports.error';
import { toNewUserReportPo, toUserReportDto } from './reports.mapper';

/** What a new report reads and writes, in one transaction (the claim of the screenshots locks). */
export type ReportWriteScope = Readonly<{
  reports: Pick<ReportsDao, 'accountOf' | 'sharedCampaignNameOf' | 'insertOpen'>;
  attachments: Pick<ReportAttachmentsDao, 'lockLooseOf' | 'claim'>;
}>;

export type ReportWriteTransactionRunner = <T>(
  work: (scope: ReportWriteScope) => Promise<T>,
) => Promise<T>;

export type ReportsServiceDeps = Readonly<{
  transaction: ReportWriteTransactionRunner;
  reports: Pick<ReportsDao, 'pageOf' | 'closeOpen'>;
  attachments: Pick<ReportAttachmentsDao, 'listOf'>;
  /** The reporter, read to tell them the report was looked at. */
  accounts: Pick<UsersDao, 'findById'>;
  notices: Pick<SecurityNoticesService, 'send'>;
  cipher: DataCipherPort;
  appPublicUrl: string;
  /** `USER_REPORTS_PAGE_SIZE`, passed in. */
  pageSize: number;
}>;

export type ReportResolver = Readonly<{ id: string; role: UserPo['role'] }>;

type ReportCampaign = Readonly<{ id: string; name: string }>;

/** Reports from the session's account and the backoffice queue that closes them.
 *
 *  Example: `await service.report(biaId, caioId, { reason: 'spam' })` */
export class ReportsService {
  constructor(private readonly deps: ReportsServiceDeps) {}

  /** One open report per pair, with the table both sit at and the screenshots the reporter sent;
   *  the reporter gets nothing back but the acceptance.
   *
   *  Example: `await service.report(biaId, caioId, { reason: 'harassment', campaignId: vharnId })` */
  async report(reporterId: string, targetId: string, request: UserReportRequestDto): Promise<void> {
    UserReportBo.requireNotSelf(reporterId, targetId);
    const attachmentIds = request.attachmentIds ?? [];
    await this.deps.transaction(async (scope) => {
      const target = await scope.reports.accountOf(targetId);
      const reported = UserReportBo.requireActiveTarget(target, targetId);
      const reporter = await reporterOf(scope, reporterId);
      const campaign = await campaignOf(scope, request.campaignId, reporterId, targetId);
      const loose = await scope.attachments.lockLooseOf(reporterId, attachmentIds);
      UserReportBo.requireClaimable(attachmentIds, loose);
      const { reason, details = null } = request;
      const row = { reporterId, targetId, reporter, target: reported, campaign, reason, details };
      const inserted = await scope.reports.insertOpen(toNewUserReportPo(row));
      const reportId = UserReportBo.requireInserted(inserted, reporterId, targetId);
      await scope.attachments.claim(reportId, attachmentIds);
    });
  }

  /** Example: `await service.list({ status: 'open', page: 1 }) // { reports, page, pageSize, total }` */
  async list(query: ListUserReportsQueryDto): Promise<UserReportsPageDto> {
    const { pageSize } = this.deps;
    const offset = (query.page - 1) * pageSize;
    const found = await this.deps.reports.pageOf({ status: query.status, limit: pageSize, offset });
    const attachments = await this.deps.attachments.listOf(found.rows.map((row) => row.id));
    const reports = found.rows.map((row) => toUserReportDto(row, attachmentsOf(row, attachments)));
    return { reports, page: query.page, pageSize, total: found.total };
  }

  /** Closes with the admin's note, then tells the reporter (best-effort: a mail that fails does not
   *  reopen the report).
   *
   *  Example: `await service.resolve(root, reportId, { status: 'resolved', note: 'warned' })` */
  async resolve(
    admin: ReportResolver,
    reportId: string,
    request: ResolveUserReportRequestDto,
  ): Promise<UserReportDto> {
    UserReportBo.requireResolver(admin.role);
    const closing = { adminId: admin.id, status: request.status, note: request.note ?? null };
    const closed = await this.deps.reports.closeOpen(reportId, closing);
    if (!closed) {
      throw new ReportsError(
        'REPORT_NOT_FOUND',
        `report ${reportId} not found: expected an open one`,
      );
    }
    await this.tellReporter(closed);
    return toUserReportDto(closed, await this.deps.attachments.listOf([closed.id]));
  }

  // A reporter whose account is gone is not told: there is no address left.
  private async tellReporter(closed: UserReportViewRow): Promise<void> {
    if (closed.reporterId === null) return;
    const row = await this.deps.accounts.findById(closed.reporterId);
    if (!row) return;
    const person = recipientOf(row, this.deps.cipher);
    const publicUrl = this.deps.appPublicUrl;
    await this.deps.notices.send(
      reportReviewedMail({ person, reportedAt: closed.createdAt, publicUrl }),
    );
  }
}

async function reporterOf(scope: ReportWriteScope, reporterId: string): Promise<ReportedAccount> {
  const reporter = await scope.reports.accountOf(reporterId);
  if (reporter) return reporter;
  throw new Error(`reporter ${reporterId} not found: expected the session's account`);
}

async function campaignOf(
  scope: ReportWriteScope,
  campaignId: string | null | undefined,
  reporterId: string,
  targetId: string,
): Promise<ReportCampaign | null> {
  if (campaignId === null || campaignId === undefined) return null;
  const shared = await scope.reports.sharedCampaignNameOf(campaignId, reporterId, targetId);
  return { id: campaignId, name: UserReportBo.requireSharedCampaign(campaignId, shared) };
}

function attachmentsOf(
  row: UserReportViewRow,
  attachments: readonly ReportAttachmentPo[],
): ReportAttachmentPo[] {
  return attachments.filter((attachment) => attachment.reportId === row.id);
}
