import type { UserPo } from '../auth/users.po';
import { ReportsError } from './reports.error';

/** An account as a report sees it: the @ and name it has now (kept with the report), and whether
 *  it is suspended. */
export type ReportedAccount = Readonly<{ username: string; name: string; suspended: boolean }>;

/** Who reports whom, with which table and screenshots, and who closes a report.
 *
 *  Example: `UserReportBo.requireNotSelf(biaId, caioId)` */
export const UserReportBo = {
  /** Example: `UserReportBo.requireNotSelf(biaId, biaId) // throws REPORT_SELF` */
  requireNotSelf(reporterId: string, targetId: string): void {
    if (reporterId !== targetId) return;
    throw new ReportsError('REPORT_SELF', `account ${reporterId} reported itself`);
  },

  /** An unknown and a suspended account answer the same, as the profile card does.
   *
   *  Example: `UserReportBo.requireActiveTarget(undefined, caioId) // throws REPORT_TARGET_NOT_FOUND` */
  requireActiveTarget(account: ReportedAccount | undefined, targetId: string): ReportedAccount {
    if (account !== undefined && !account.suspended) return account;
    throw new ReportsError(
      'REPORT_TARGET_NOT_FOUND',
      `account ${targetId} not found: expected an active account`,
    );
  },

  /** `sharedName` is the table's name when both accounts sit at it, `undefined` otherwise.
   *
   *  Example: `UserReportBo.requireSharedCampaign(vharnId, 'Vharn') // 'Vharn'` */
  requireSharedCampaign(campaignId: string, sharedName: string | undefined): string {
    if (sharedName !== undefined) return sharedName;
    throw new ReportsError(
      'CAMPAIGN_NOT_SHARED',
      `campaign ${campaignId} is not shared by the two accounts: expected a table both sit at`,
    );
  },

  /** Every screenshot asked for must be one the reporter sent and no report claimed yet; anything
   *  else answers the same not found (it never tells whose it is).
   *
   *  Example: `UserReportBo.requireClaimable([shotA], []) // throws ATTACHMENT_NOT_FOUND` */
  requireClaimable(requestedIds: readonly string[], looseIds: readonly string[]): void {
    const missing = requestedIds.find((id) => !looseIds.includes(id));
    if (missing === undefined) return;
    throw new ReportsError(
      'ATTACHMENT_NOT_FOUND',
      `screenshot ${missing} not found: expected one the reporter sent and no report claimed`,
    );
  },

  /** `reportId` is `undefined` when the pair already had an open report (the partial unique
   *  index); otherwise it is given back.
   *
   *  Example: `UserReportBo.requireInserted(undefined, biaId, caioId) // throws REPORT_ALREADY_OPEN` */
  requireInserted(reportId: string | undefined, reporterId: string, targetId: string): string {
    if (reportId !== undefined) return reportId;
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
