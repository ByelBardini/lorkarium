import type { UserPo } from '../auth/users.po';
import { ReportsError } from './reports.error';

/** Who reports whom and who closes a report.
 *
 *  Example: `UserReportBo.requireNotSelf(biaId, caioId)` */
export const UserReportBo = {
  /** Example: `UserReportBo.requireNotSelf(biaId, biaId) // throws REPORT_SELF` */
  requireNotSelf(reporterId: string, targetId: string): void {
    if (reporterId !== targetId) return;
    throw new ReportsError('REPORT_SELF', `account ${reporterId} reported itself`);
  },

  /** `inserted` is `false` when the pair already had an open report (the partial unique index).
   *
   *  Example: `UserReportBo.requireInserted(false, biaId, caioId) // throws REPORT_ALREADY_OPEN` */
  requireInserted(inserted: boolean, reporterId: string, targetId: string): void {
    if (inserted) return;
    throw new ReportsError(
      'REPORT_ALREADY_OPEN',
      `account ${reporterId} already has an open report on ${targetId}: expected it resolved or dismissed first`,
    );
  },

  /** Only an admin resolves or dismisses.
   *
   *  Example: `UserReportBo.requireResolver('user') // throws REPORT_FORBIDDEN` */
  requireResolver(role: UserPo['role']): void {
    if (role === 'admin') return;
    throw new ReportsError('REPORT_FORBIDDEN', `role ${role} resolved a report: expected admin`);
  },
};
