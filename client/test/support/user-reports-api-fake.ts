import type {
  ListUserReportsQueryDto,
  ResolveUserReportRequestDto,
  UserReportDto,
  UserReportsPageDto,
} from '@lorkarium/contracts';
import type { UserAdminResult } from '@/services/user-admin-api';
import type { UserReportsApi } from '@/services/user-reports-api';
import { ScriptedAnswers } from './scripted-answers';

type Answers = {
  list: UserAdminResult<UserReportsPageDto>;
  resolve: UserAdminResult<UserReportDto>;
};

/** A `UserReportsApi` over the reports in `reports` (none by default): `list` filters them by
 *  status like the server, and `resolve` closes an open one (so it leaves the open queue).
 *
 *  Example: `api.put(SPAM_REPORT); api.answers.answer('resolve', { ok: false, failure: { kind: 'not_found' } })` */
export class UserReportsApiFake implements UserReportsApi {
  readonly reports = new Map<string, UserReportDto>();
  readonly answers = new ScriptedAnswers<Answers>();

  put(...reports: UserReportDto[]): this {
    for (const report of reports) this.reports.set(report.id, report);
    return this;
  }

  list(query: ListUserReportsQueryDto): Promise<Answers['list']> {
    return this.answers.reply('list', query, () => {
      const rows = [...this.reports.values()].filter((report) => report.status === query.status);
      return {
        ok: true,
        value: { reports: rows, page: query.page, pageSize: 50, total: rows.length },
      };
    });
  }

  resolve(reportId: string, request: ResolveUserReportRequestDto): Promise<Answers['resolve']> {
    const argument = { reportId, ...request };
    return this.answers.reply('resolve', argument, () => this.close(reportId, request));
  }

  private close(reportId: string, request: ResolveUserReportRequestDto): Answers['resolve'] {
    const report = this.reports.get(reportId);
    if (report?.status !== 'open') return { ok: false, failure: { kind: 'not_found' } };
    const closed: UserReportDto = {
      ...report,
      status: request.status,
      adminNote: request.note ?? null,
      resolvedAt: report.createdAt,
      resolvedBy: 'lucas',
    };
    this.reports.set(reportId, closed);
    return { ok: true, value: closed };
  }
}
