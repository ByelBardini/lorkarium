import type { UserReportAttachmentDto, UserReportDto } from '@lorkarium/contracts';
import type { NormalizedImage } from '../assets/image-processor.port';
import { screenshotDtoOf } from '../assets/screenshot-upload';
import type { ReportAttachmentPo, NewReportAttachmentPo } from './report-attachments.po';
import type { ReportedAccount } from './reports.bo';
import type { UserReportViewRow } from './reports.dao';
import type { NewUserReportPo, UserReportPo } from './user-reports.po';

/** The bucket key of a screenshot: never a file name, always under `reports/`.
 *
 *  Example: `reportAttachmentKeyOf(id) // 'reports/<id>'` */
export function reportAttachmentKeyOf(attachmentId: string): string {
  return `reports/${attachmentId}`;
}

export type NewReportInput = Readonly<{
  reporterId: string;
  targetId: string;
  reporter: ReportedAccount;
  target: ReportedAccount;
  campaign: Readonly<{ id: string; name: string }> | null;
  reason: UserReportPo['reason'];
  details: string | null;
}>;

/** The row of a new report, with the @ and names of the time (they outlive the accounts).
 *
 *  Example: `toNewUserReportPo({ reporterId, targetId, reporter, target, campaign: null, … })` */
export function toNewUserReportPo(input: NewReportInput): NewUserReportPo {
  return {
    reporterId: input.reporterId,
    targetId: input.targetId,
    reporterUsername: input.reporter.username,
    targetUsername: input.target.username,
    targetName: input.target.name,
    campaignId: input.campaign?.id ?? null,
    campaignName: input.campaign?.name ?? null,
    reason: input.reason,
    details: input.details,
  };
}

export type NewAttachmentInput = Readonly<{
  attachmentId: string;
  uploaderId: string;
  image: NormalizedImage;
  mimeType: ReportAttachmentPo['mimeType'];
}>;

/** The row of a loose screenshot: type, bytes and pixels as kept (normalized).
 *
 *  Example: `toNewReportAttachmentPo({ attachmentId, uploaderId: biaId, image, mimeType })` */
export function toNewReportAttachmentPo(input: NewAttachmentInput): NewReportAttachmentPo {
  const { attachmentId, image } = input;
  return {
    id: attachmentId,
    reportId: null,
    uploadedBy: input.uploaderId,
    storageKey: reportAttachmentKeyOf(attachmentId),
    mimeType: input.mimeType,
    sizeBytes: image.bytes.byteLength,
    width: image.width,
    height: image.height,
  };
}

/** Example: `toUserReportAttachmentDto(row) // { id, mimeType: 'image/webp', width, height, sizeBytes }` */
export function toUserReportAttachmentDto(row: ReportAttachmentPo): UserReportAttachmentDto {
  return screenshotDtoOf(row);
}

/** A report as the backoffice queue shows it, with its screenshots.
 *
 *  Example: `toUserReportDto(row, attachments).reporter.username // 'bia'` */
export function toUserReportDto(
  row: UserReportViewRow,
  attachments: readonly ReportAttachmentPo[],
): UserReportDto {
  return {
    id: row.id,
    reason: row.reason,
    details: row.details,
    status: row.status,
    reporter: { id: row.reporterId, username: row.reporterUsername },
    target: { id: row.targetId, username: row.targetUsername, name: row.targetName },
    campaignId: row.campaignId,
    campaignName: row.campaignName,
    attachments: attachments.map(toUserReportAttachmentDto),
    adminNote: row.adminNote,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedBy: row.resolverUsername,
  };
}
