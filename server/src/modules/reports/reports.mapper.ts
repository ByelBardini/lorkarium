import type { UserReportDto } from '@lorkarium/contracts';
import type { UserReportViewRow } from './reports.dao';

/** A joined report row as the backoffice queue shows it.
 *
 *  Example: `toUserReportDto(row).reporter.username // 'bia'` */
export function toUserReportDto(row: UserReportViewRow): UserReportDto {
  return {
    id: row.id,
    reason: row.reason,
    details: row.details,
    status: row.status,
    reporter: { id: row.reporterId, username: row.reporterUsername },
    target: { id: row.targetId, username: row.targetUsername },
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedBy: row.resolverUsername,
  };
}
