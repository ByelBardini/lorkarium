import { z } from 'zod';
import {
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_MIME_TYPES,
  SCREENSHOTS_MAX,
  screenshotDto,
  screenshotIdsDto,
  screenshotResponseDto,
} from '../screenshots/screenshot.dto';

export const USER_REPORT_DETAILS_MAX_LENGTH = 1000;

/** Why an account is reported; the admin reads it in the backoffice queue. */
export const USER_REPORT_REASONS = [
  'harassment',
  'hate_speech',
  'spam',
  'cheating',
  'inappropriate_content',
  'impersonation',
  'other',
] as const;

export const userReportReasonDto = z.enum(USER_REPORT_REASONS, {
  error: (issue) =>
    `report reason ${JSON.stringify(issue.input)}: expected one of ${USER_REPORT_REASONS.join(', ')}`,
});
export type UserReportReason = z.infer<typeof userReportReasonDto>;

/** A report carries a conversation in parts without turning into a file store. */
export const USER_REPORT_ATTACHMENTS_MAX = SCREENSHOTS_MAX;
export const USER_REPORT_ATTACHMENT_MAX_BYTES = SCREENSHOT_MAX_BYTES;
/** The screenshot types `POST /api/reports/attachments` accepts (the `Content-Type` of the body). */
export const USER_REPORT_ATTACHMENT_MIME_TYPES = SCREENSHOT_MIME_TYPES;
export const USER_REPORT_ADMIN_NOTE_MAX_LENGTH = 2000;

function trimmedOrNull(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((text) => (text === '' ? null : text))
    .nullable()
    .optional();
}

/** Body of `POST /api/users/:userId/reports`: a reason, optional details (trimmed, up to 1000;
 *  only spaces become `null`), the table where it happened (one both accounts sit at) and the ids
 *  of up to 5 screenshots the reporter uploaded first. The reporter comes from the session (strict).
 *
 *  Example: `userReportRequestDto.parse({ reason: 'spam', details: ' ' }).details // null` */
export const userReportRequestDto = z.strictObject({
  reason: userReportReasonDto,
  details: trimmedOrNull(USER_REPORT_DETAILS_MAX_LENGTH),
  campaignId: z.uuid().nullable().optional(),
  attachmentIds: screenshotIdsDto.optional(),
});
export type UserReportRequestDto = z.infer<typeof userReportRequestDto>;

/** A screenshot as it was kept (normalized, without metadata): what the backoffice lays out. */
export const userReportAttachmentDto = screenshotDto;
export type UserReportAttachmentDto = z.infer<typeof userReportAttachmentDto>;

/** Response of `POST /api/reports/attachments`: the id the report then cites. */
export const userReportAttachmentResponseDto = screenshotResponseDto;
export type UserReportAttachmentResponseDto = z.infer<typeof userReportAttachmentResponseDto>;

/** Params of `GET /api/admin/reports/:reportId/attachments/:attachmentId`. */
export const userReportAttachmentParamsDto = z.strictObject({
  reportId: z.uuid(),
  attachmentId: z.uuid(),
});

/** Lifecycle of a report: open until the admin resolves or dismisses it. */
export const USER_REPORT_STATUSES = ['open', 'resolved', 'dismissed'] as const;
export const userReportStatusDto = z.enum(USER_REPORT_STATUSES);
export type UserReportStatus = z.infer<typeof userReportStatusDto>;

/** Body of `PATCH /api/admin/reports/:reportId`: an open report never comes back to `open`. The
 *  admin's note (trimmed, up to 2000; only spaces become `null`) stays in the backoffice.
 *
 *  Example: `resolveUserReportRequestDto.parse({ status: 'dismissed', note: 'no proof' })` */
export const resolveUserReportRequestDto = z.strictObject({
  status: z.enum(['resolved', 'dismissed']),
  note: trimmedOrNull(USER_REPORT_ADMIN_NOTE_MAX_LENGTH),
});
export type ResolveUserReportRequestDto = z.infer<typeof resolveUserReportRequestDto>;

/** One side of a report as the backoffice shows it: the @ kept when the report was made, and the
 *  account id, `null` once that account is deleted (the report outlives it). */
export const userReportPartyDto = z.strictObject({ id: z.uuid().nullable(), username: z.string() });

/** The reported side also keeps the name it had when reported. */
export const userReportTargetDto = userReportPartyDto.extend({ name: z.string() });

/** A report in the backoffice queue: never shown to the reporter. `campaignId` is the table where
 *  it happened (`null` with no table, or once the table is deleted; `campaignName` stays).
 *  `resolvedBy` is the admin's @, `null` while open or once that admin's account is gone. */
export const userReportDto = z.strictObject({
  id: z.uuid(),
  reason: userReportReasonDto,
  details: z.string().nullable(),
  status: userReportStatusDto,
  reporter: userReportPartyDto,
  target: userReportTargetDto,
  campaignId: z.uuid().nullable(),
  campaignName: z.string().nullable(),
  attachments: z.array(userReportAttachmentDto),
  adminNote: z.string().nullable(),
  createdAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
  resolvedBy: z.string().nullable(),
});
export type UserReportDto = z.infer<typeof userReportDto>;

export const USER_REPORTS_PAGE_SIZE = 50;

/** Query of `GET /api/admin/reports`: one status (the open ones by default), pages from 1.
 *
 *  Example: `listUserReportsQueryDto.parse({ page: '2' }) // { status: 'open', page: 2 }` */
export const listUserReportsQueryDto = z.strictObject({
  status: userReportStatusDto.default('open'),
  page: z.coerce.number().int().min(1).default(1),
});
export type ListUserReportsQueryDto = z.infer<typeof listUserReportsQueryDto>;

/** Response of `GET /api/admin/reports`: one page, oldest first, and the total of that status. */
export const userReportsPageDto = z.strictObject({
  reports: z.array(userReportDto),
  page: z.int().min(1),
  pageSize: z.int().positive(),
  total: z.int().nonnegative(),
});
export type UserReportsPageDto = z.infer<typeof userReportsPageDto>;

/** Params of `PATCH /api/admin/reports/:reportId`. */
export const userReportParamsDto = z.strictObject({ reportId: z.uuid() });

/** Response of `PATCH /api/admin/reports/:reportId`. */
export const userReportResponseDto = z.strictObject({ report: userReportDto });
export type UserReportResponseDto = z.infer<typeof userReportResponseDto>;
