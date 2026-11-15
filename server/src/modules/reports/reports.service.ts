import type {
  ListUserReportsQueryDto,
  ResolveUserReportRequestDto,
  UserReportDto,
  UserReportRequestDto,
  UserReportsPageDto,
} from '@lorkarium/contracts';
import type { UsersDao } from '../auth/users.dao';
import type { UserPo } from '../auth/users.po';
import { UserReportBo } from './reports.bo';
import type { ReportsDao } from './reports.dao';
import { ReportsError } from './reports.error';
import { toUserReportDto } from './reports.mapper';

export type UserReportsDao = Pick<ReportsDao, 'insertOpen' | 'pageOf' | 'closeOpen'>;

export type ReportsServiceDeps = Readonly<{
  reports: UserReportsDao;
  accounts: Pick<UsersDao, 'isActive'>;
  /** `USER_REPORTS_PAGE_SIZE`, passed in. */
  pageSize: number;
}>;

export type ReportResolver = Readonly<{ id: string; role: UserPo['role'] }>;

/** Reports from the session's account and the backoffice queue that closes them.
 *
 *  Example: `await service.report(biaId, caioId, { reason: 'spam' })` */
export class ReportsService {
  constructor(private readonly deps: ReportsServiceDeps) {}

  /** One open report per pair; the reporter gets nothing back but the acceptance.
   *
   *  Example: `await service.report(biaId, caioId, { reason: 'harassment', details: 'insults' })` */
  async report(reporterId: string, targetId: string, request: UserReportRequestDto): Promise<void> {
    UserReportBo.requireNotSelf(reporterId, targetId);
    await this.requireActiveTarget(targetId);
    const { reason, details = null } = request;
    const inserted = await this.deps.reports.insertOpen({ reporterId, targetId, reason, details });
    UserReportBo.requireInserted(inserted, reporterId, targetId);
  }

  /** Example: `await service.list({ status: 'open', page: 1 }) // { reports, page, pageSize, total }` */
  async list(query: ListUserReportsQueryDto): Promise<UserReportsPageDto> {
    const { pageSize } = this.deps;
    const offset = (query.page - 1) * pageSize;
    const found = await this.deps.reports.pageOf({ status: query.status, limit: pageSize, offset });
    const reports = found.rows.map(toUserReportDto);
    return { reports, page: query.page, pageSize, total: found.total };
  }

  /** Example: `await service.resolve(root, reportId, { status: 'resolved' })` */
  async resolve(
    admin: ReportResolver,
    reportId: string,
    request: ResolveUserReportRequestDto,
  ): Promise<UserReportDto> {
    UserReportBo.requireResolver(admin.role);
    const closed = await this.deps.reports.closeOpen(reportId, admin.id, request.status);
    if (closed) return toUserReportDto(closed);
    throw new ReportsError(
      'REPORT_NOT_FOUND',
      `report ${reportId} not found: expected an open one`,
    );
  }

  private async requireActiveTarget(targetId: string): Promise<void> {
    if (await this.deps.accounts.isActive(targetId)) return;
    throw new ReportsError(
      'REPORT_TARGET_NOT_FOUND',
      `account ${targetId} not found: expected an active account`,
    );
  }
}
