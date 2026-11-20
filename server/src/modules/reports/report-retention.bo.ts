/** How long a closed report lasts: the same 6 months as the access log, counted from the close. */
export const CLOSED_REPORT_RETENTION_MONTHS = 6;

/** A screenshot no report claimed is an abandoned form after a day. */
export const LOOSE_ATTACHMENT_TTL_MS = 24 * 60 * 60_000;

/** The cuts of the reports' retention: older than the cut goes.
 *
 *  Example: `ReportRetentionBo.closedReportsCutOf(new Date('2026-11-19')) // 2026-05-19` */
export const ReportRetentionBo = {
  /** Calendar months; a day the earlier month lacks falls on its last day (31/08 → 28/02).
   *
   *  Example: `ReportRetentionBo.closedReportsCutOf(new Date('2026-08-31T10:00Z')) // 2026-02-28T10:00Z` */
  closedReportsCutOf(now: Date): Date {
    const cut = new Date(now.getTime());
    const day = cut.getUTCDate();
    cut.setUTCDate(1);
    cut.setUTCMonth(cut.getUTCMonth() - CLOSED_REPORT_RETENTION_MONTHS);
    cut.setUTCDate(Math.min(day, daysInMonthOf(cut)));
    return cut;
  },

  /** Example: `ReportRetentionBo.looseAttachmentsCutOf(now) // now − 24 h` */
  looseAttachmentsCutOf(now: Date): Date {
    return new Date(now.getTime() - LOOSE_ATTACHMENT_TTL_MS);
  },
};

function daysInMonthOf(date: Date): number {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}
