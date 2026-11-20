/** Where the backoffice reads a screenshot of a report:
 *  `GET /api/admin/reports/:reportId/attachments/:attachmentId` (admin only, never cached).
 *
 *  Example: `reportAttachmentUrlOf(report.id, shot.id) // '/api/admin/reports/9c3f…/attachments/4e5f…'` */
export function reportAttachmentUrlOf(reportId: string, attachmentId: string): string {
  return `/api/admin/reports/${encodeURIComponent(reportId)}/attachments/${encodeURIComponent(attachmentId)}`;
}
