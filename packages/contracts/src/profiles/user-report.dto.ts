import { z } from 'zod';

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

/** Body of `POST /api/users/:userId/reports`: a reason and optional details (trimmed, up to 1000;
 *  only spaces become `null`). The reporter comes from the session (strict).
 *
 *  Example: `userReportRequestDto.parse({ reason: 'spam', details: ' ' }).details // null` */
export const userReportRequestDto = z.strictObject({
  reason: userReportReasonDto,
  details: z
    .string()
    .trim()
    .max(USER_REPORT_DETAILS_MAX_LENGTH)
    .transform((details) => (details === '' ? null : details))
    .nullable()
    .optional(),
});
export type UserReportRequestDto = z.infer<typeof userReportRequestDto>;

/** Lifecycle of a report: open until the admin resolves or dismisses it. */
export const USER_REPORT_STATUSES = ['open', 'resolved', 'dismissed'] as const;
export const userReportStatusDto = z.enum(USER_REPORT_STATUSES);
export type UserReportStatus = z.infer<typeof userReportStatusDto>;

/** Body of `PATCH /api/admin/reports/:reportId`: an open report never comes back to `open`.
 *
 *  Example: `resolveUserReportRequestDto.parse({ status: 'dismissed' })` */
export const resolveUserReportRequestDto = z.strictObject({
  status: z.enum(['resolved', 'dismissed']),
});
export type ResolveUserReportRequestDto = z.infer<typeof resolveUserReportRequestDto>;

/** One side of a report as the backoffice shows it: the account and its @. */
export const userReportPartyDto = z.strictObject({ id: z.uuid(), username: z.string() });

/** A report in the backoffice queue: never shown to the reporter. `resolvedBy` is the admin's @,
 *  `null` while open or once that admin's account is gone. */
export const userReportDto = z.strictObject({
  id: z.uuid(),
  reason: userReportReasonDto,
  details: z.string().nullable(),
  status: userReportStatusDto,
  reporter: userReportPartyDto,
  target: userReportPartyDto,
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
