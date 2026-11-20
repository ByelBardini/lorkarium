import type { UserReportAttachmentDto } from '@lorkarium/contracts';
import type { AssetStoragePort, StoredObject } from '../assets/asset-storage.port';
import type { ImageProcessorPort } from '../assets/image-processor.port';
import { keptScreenshotOf, type ScreenshotRefusals } from '../assets/screenshot-upload';
import type { ReportAttachmentsDao } from './report-attachments.dao';
import type { ReportAttachmentPo } from './report-attachments.po';
import { ReportAttachmentTooLargeError, ReportsError } from './reports.error';
import { toNewReportAttachmentPo, toUserReportAttachmentDto } from './reports.mapper';

export type ReportAttachmentWriteRunner = <T>(
  work: (attachments: Pick<ReportAttachmentsDao, 'insert'>) => Promise<T>,
) => Promise<T>;

/** How big a screenshot may arrive and the side it is kept at (`USER_REPORT_ATTACHMENT_MAX_BYTES`
 *  and the library's 4096 px, passed in). */
export type ReportAttachmentLimits = Readonly<{ maxBytes: number; maxSide: number }>;

const REFUSALS: ScreenshotRefusals = {
  tooLarge: (maxBytes, sizeBytes) => new ReportAttachmentTooLargeError(maxBytes, sizeBytes),
  unsupported: (detail) => new ReportsError('UNSUPPORTED_IMAGE', detail),
};

export type ReportAttachmentsServiceDeps = Readonly<{
  transaction: ReportAttachmentWriteRunner;
  attachments: Pick<ReportAttachmentsDao, 'findInReport'>;
  storage: Pick<AssetStoragePort, 'put' | 'open'>;
  processor: ImageProcessorPort;
  newId: () => string;
  limits: ReportAttachmentLimits;
}>;

/** A screenshot as the backoffice reads it: the bytes and the kept type. */
export type OpenedReportAttachment = StoredObject &
  Readonly<{ mimeType: ReportAttachmentPo['mimeType'] }>;

/** The screenshots of the reports: the reporter sends each one alone before the report, and only
 *  the backoffice reads them back.
 *
 *  Example: `const { id } = await attachments.upload(biaId, bytes)` */
export class ReportAttachmentsService {
  constructor(private readonly deps: ReportAttachmentsServiceDeps) {}

  /** Normalized (no EXIF, opaque ones as WebP) before it is kept; the row and the object are
   *  written together, so a failed put leaves no row.
   *
   *  Example: `await attachments.upload(biaId, png) // { id, mimeType: 'image/webp', … }` */
  async upload(uploaderId: string, bytes: Uint8Array): Promise<UserReportAttachmentDto> {
    const { processor, limits } = this.deps;
    const { image, mimeType } = await keptScreenshotOf(bytes, { processor, limits }, REFUSALS);
    const row = toNewReportAttachmentPo({
      attachmentId: this.deps.newId(),
      uploaderId,
      image,
      mimeType,
    });
    const kept = await this.deps.transaction(async (attachments) => {
      const inserted = await attachments.insert(row);
      await this.deps.storage.put(inserted.storageKey, image.bytes, mimeType);
      return inserted;
    });
    return toUserReportAttachmentDto(kept);
  }

  /** A screenshot of that report; one of another report, a loose one and an object gone from
   *  the bucket all answer the same ATTACHMENT_NOT_FOUND.
   *
   *  Example: `await attachments.open(reportId, shotId) // { body, size, contentType, mimeType }` */
  async open(reportId: string, attachmentId: string): Promise<OpenedReportAttachment> {
    const row = await this.deps.attachments.findInReport(reportId, attachmentId);
    const stored = row ? await this.deps.storage.open(row.storageKey) : null;
    if (row && stored) return { ...stored, mimeType: row.mimeType };
    throw new ReportsError(
      'ATTACHMENT_NOT_FOUND',
      `screenshot ${attachmentId} of report ${reportId} not found: expected one kept with it`,
    );
  }
}
