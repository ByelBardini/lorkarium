/** Where the backoffice reads a screenshot of a feedback entry:
 *  `GET /api/admin/feedback/:feedbackId/attachments/:attachmentId` (admin only, never cached).
 *
 *  Example: `feedbackAttachmentUrlOf(entry.id, shot.id) // '/api/admin/feedback/9c3f…/attachments/4e5f…'` */
export function feedbackAttachmentUrlOf(feedbackId: string, attachmentId: string): string {
  return `/api/admin/feedback/${encodeURIComponent(feedbackId)}/attachments/${encodeURIComponent(attachmentId)}`;
}
